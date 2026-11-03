"""Count release asset downloads from `gh api --paginate --slurp` JSON."""
import json
import sys


def count_downloads(pages):
    return sum(asset['download_count'] for page in pages for release in page if not release.get('draft', False)
               for asset in release.get('assets', [])
               if asset['name'].endswith(('.tar.gz', '.exe', '.dmg')))


if __name__ == '__main__':
    print(count_downloads(json.load(sys.stdin)))
