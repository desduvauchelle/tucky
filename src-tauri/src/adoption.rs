//! Explicit, one-shot adoption reporting. Never called from startup or capture paths.
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::State;
use tracing::{info, warn};

use crate::commands::AppState;

// Serialize choice + disk persistence across simultaneous IPC calls. Never held across HTTP.
static CHOICE_LOCK: Mutex<()> = Mutex::new(());
const UNAVAILABLE: &str = "Installation counting is unavailable in this build. Nothing was sent.";

#[derive(Serialize)]
pub struct AdoptionStatus {
    available: bool,
    choice: String,
}

pub(crate) fn initial_choice(existing_store: bool, entries: usize, primary: bool) -> &'static str {
    if !existing_store && entries == 0 && primary {
        "pending"
    } else {
        "ineligible"
    }
}

fn endpoint() -> Result<url::Url, &'static str> {
    parse_endpoint(option_env!("TUCKY_ADOPTION_ENDPOINT").unwrap_or(""))
}

fn parse_endpoint(raw: &str) -> Result<url::Url, &'static str> {
    let url = url::Url::parse(raw).map_err(|_| UNAVAILABLE)?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(UNAVAILABLE);
    }
    Ok(url)
}

#[derive(Serialize)]
struct FirstLaunch<'a> {
    event: &'static str,
    version: &'a str,
    platform: &'static str,
}

fn payload() -> FirstLaunch<'static> {
    FirstLaunch {
        event: "first_launch",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}

#[tauri::command]
pub fn adoption_status(state: State<'_, AppState>) -> AdoptionStatus {
    AdoptionStatus {
        available: endpoint().is_ok(),
        choice: state.settings.adoption_choice(),
    }
}

#[tauri::command]
pub async fn adoption_choose(count: bool, state: State<'_, AppState>) -> Result<(), String> {
    // Construct the client BEFORE consuming the one attempt, but perform no network IO.
    let destination = if count {
        Some(endpoint().map_err(str::to_owned)?)
    } else {
        None
    };
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|_| "Could not prepare installation counting. Nothing was sent.".to_owned())?;
    {
        let _guard = CHOICE_LOCK
            .lock()
            .map_err(|_| "Could not save your choice.".to_owned())?;
        if state.settings.adoption_choice() != "pending" {
            return Err("A choice has already been saved for this installation.".to_owned());
        }
        // Persist before sending: ambiguous failures are NOT retried. No server-side ID needed.
        state.settings.set_adoption_choice(if count { "attempted" } else { "declined" })
            .map_err(|error| {
                warn!(target: "adoption", ?error, "could not persist installation-count choice; no request sent");
                "Could not save your choice. Nothing was sent.".to_owned()
            })?;
    }
    let Some(destination) = destination else {
        info!(target: "adoption", "installation counting declined; no request sent");
        return Ok(());
    };
    info!(target: "adoption", "sending user-approved one-time installation count");
    let result = client.post(destination).json(&payload()).send().await;
    match result {
        Ok(response) if response.status() == reqwest::StatusCode::NO_CONTENT => {
            info!(target: "adoption", "installation count accepted");
            Ok(())
        }
        Ok(response) => {
            // Do not read/log response bodies or network metadata on this privacy-sensitive path.
            warn!(target: "adoption", status = response.status().as_u16(), "installation count unconfirmed; will not retry");
            Err("We could not confirm your installation was counted. We won’t retry, to avoid counting twice. You can continue setup.".to_owned())
        }
        Err(_) => {
            warn!(target: "adoption", "installation count network failure; will not retry");
            Err("We could not confirm your installation was counted. We won’t retry, to avoid counting twice. You can continue setup.".to_owned())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upgrades_resets_and_isolated_builds_are_not_new_installs() {
        assert_eq!(initial_choice(false, 0, true), "pending");
        assert_eq!(initial_choice(true, 0, true), "ineligible");
        assert_eq!(initial_choice(false, 1, true), "ineligible");
        assert_eq!(initial_choice(false, 0, false), "ineligible");
    }

    #[test]
    fn endpoint_requires_https_without_identifiers() {
        for raw in [
            "",
            "http://example.com/first-launch",
            "https://user:pass@example.com/first-launch",
            "https://example.com/first-launch?user=123",
            "https://example.com/#secret",
        ] {
            assert!(parse_endpoint(raw).is_err());
        }
        assert!(parse_endpoint("https://example.com/first-launch").is_ok());
    }

    #[test]
    fn report_contains_only_event_version_and_platform() {
        let value = serde_json::to_value(payload()).unwrap();
        let fields = value.as_object().unwrap();
        assert_eq!(fields.len(), 3);
        assert_eq!(value["event"], "first_launch");
        assert_eq!(value["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(value["platform"], std::env::consts::OS);
    }
}
