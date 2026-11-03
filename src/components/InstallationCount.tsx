import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adoptionChoose, adoptionStatus, type AdoptionStatus } from "../lib/api";

/** Independent of setup: no report until the explicit Count button is pressed. */
export default function InstallationCount() {
  const { t } = useTranslation("onboarding");
  const [status, setStatus] = useState<AdoptionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    adoptionStatus().then((value) => { if (active) setStatus(value); }).catch(() => {
      if (active) setError(t("installationCount.loadError"));
    });
    return () => { active = false; };
  }, [t]);

  const choose = async (count: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await adoptionChoose(count);
      setMessage(t(count ? "installationCount.sent" : "installationCount.declined"));
    } catch (e) {
      setError(String(e));
    } finally {
      // Refresh persisted state even after a timeout: ambiguous delivery is never retried.
      try { setStatus(await adoptionStatus()); } catch { /* Keep choice disabled if state is unknown. */ }
      setBusy(false);
    }
  };

  if (status?.choice === "ineligible") return null;
  const pending = status?.choice === "pending";
  return (
    <section aria-label={t("installationCount.title")} className="mt-6 rounded-md border border-line p-3 text-xs text-muted">
      <h2 className="font-semibold text-fg">{t("installationCount.title")}</h2>
      <p className="mt-1 leading-relaxed">{t("installationCount.body")}</p>
      {pending && status.available && !message && !error ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void choose(true)} className="rounded-md border border-line px-3 py-2 text-fg hover:bg-elevated disabled:opacity-50">{t(busy ? "installationCount.sending" : "installationCount.count")}</button>
          <button type="button" disabled={busy} onClick={() => void choose(false)} className="rounded-md border border-line px-3 py-2 hover:bg-elevated disabled:opacity-50">{t("installationCount.skip")}</button>
        </div>
      ) : null}
      <p role="status" className="mt-2 leading-relaxed">{message ?? (
        !status ? t("installationCount.loading") : !pending ? t("installationCount.saved") :
        !status.available ? t("installationCount.unavailable") : t("installationCount.optional")
      )}</p>
      {error ? <p role="alert" className="mt-2 text-warning">{error}</p> : null}
    </section>
  );
}
