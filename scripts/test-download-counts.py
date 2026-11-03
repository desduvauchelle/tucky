import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).with_name('count-downloads.py')
spec = importlib.util.spec_from_file_location('download_counts', path)
module = importlib.util.module_from_spec(spec)

class DownloadCounts(unittest.TestCase):
    def test_all_pages_and_installer_formats_without_signatures(self):
        spec.loader.exec_module(module)
        pages = [[{'assets': [
            {'name': 'Tucky-arm64.dmg', 'download_count': 7},
            {'name': 'Tucky-arm64.dmg.sig', 'download_count': 90},
            {'name': 'Tucky-aarch64.tar.gz', 'download_count': 3},
        ]}], [{'assets': [{'name': 'Tucky-setup.exe', 'download_count': 2}]},
             {'draft': True, 'assets': [{'name': 'Tucky-arm64.dmg', 'download_count': 40}]}]]
        self.assertEqual(module.count_downloads(pages), 12)

if __name__ == '__main__':
    unittest.main()
