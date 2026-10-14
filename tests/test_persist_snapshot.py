import json, subprocess, sys, tempfile, unittest
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/'scripts/persist_snapshot.py'
class PersistenceTests(unittest.TestCase):
    def test_first_publication_then_update_preserves_only_news_data(self):
        self.assertTrue(SCRIPT.exists(),'snapshot persistence not implemented')
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);remote=root/'remote.git';repo=root/'repo'
            subprocess.run(['git','init','--bare',str(remote)],check=True,capture_output=True)
            subprocess.run(['git','clone',str(remote),str(repo)],check=True,capture_output=True)
            def run(*args):return subprocess.run([sys.executable,str(SCRIPT),*args],cwd=repo,capture_output=True,text=True)
            self.assertEqual(run('load','previous.json').returncode,0)
            self.assertFalse((repo/'previous.json').exists())
            (repo/'input.json').write_text('{"edition":1}')
            self.assertEqual(run('save','input.json').returncode,0)
            self.assertEqual(run('load','previous.json').returncode,0)
            self.assertEqual(json.loads((repo/'previous.json').read_text()),{'edition':1})
            (repo/'input.json').write_text('{"edition":2}')
            self.assertEqual(run('save','input.json').returncode,0)
            listing=subprocess.run(['git','--git-dir',str(remote),'ls-tree','--name-only','news-data'],capture_output=True,text=True,check=True).stdout
            self.assertEqual(listing.strip(),'news.json')
            count=subprocess.run(['git','--git-dir',str(remote),'rev-list','--count','news-data'],capture_output=True,text=True,check=True).stdout
            self.assertEqual(count.strip(),'2')
    def test_inaccessible_remote_is_not_treated_as_first_run(self):
        self.assertTrue(SCRIPT.exists(),'snapshot persistence not implemented')
        with tempfile.TemporaryDirectory() as folder:
            subprocess.run(['git','init',folder],check=True,capture_output=True)
            subprocess.run(['git','remote','add','origin',str(Path(folder)/'missing')],cwd=folder,check=True,capture_output=True)
            result=subprocess.run([sys.executable,str(SCRIPT),'load','previous.json'],cwd=folder,capture_output=True)
            self.assertNotEqual(result.returncode,0)
