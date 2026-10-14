#!/usr/bin/env python3
"""Persist editions on a data-only branch without checking out or modifying source."""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile

REF='refs/heads/news-data'

def git(*args, input=None, env=None, check=True):
    result=subprocess.run(['git',*args],input=input,capture_output=True,text=True,env=env)
    if check and result.returncode:
        raise RuntimeError('Git data operation failed. Check repository permissions and connectivity.')
    return result

def remote_head():
    result=git('ls-remote','--exit-code','--heads','origin',REF,check=False)
    if result.returncode==2:return None
    if result.returncode:raise RuntimeError('Cannot read data branch; refusing to treat this as a first run.')
    git('fetch','--no-tags','origin',REF)
    return git('rev-parse','FETCH_HEAD').stdout.strip()

def load(path):
    sha=remote_head()
    if sha:
        Path(path).write_text(git('show',f'{sha}:news.json').stdout)
    elif Path(path).exists():
        raise RuntimeError('Unexpected previous snapshot on first run.')

def save(path):
    parent=remote_head()
    blob=git('hash-object','-w',str(Path(path).resolve())).stdout.strip()
    with tempfile.TemporaryDirectory() as temporary:
        env=dict(os.environ,GIT_INDEX_FILE=str(Path(temporary)/'index'),
                 GIT_AUTHOR_NAME='github-actions[bot]',GIT_AUTHOR_EMAIL='41898282+github-actions[bot]@users.noreply.github.com',
                 GIT_COMMITTER_NAME='github-actions[bot]',GIT_COMMITTER_EMAIL='41898282+github-actions[bot]@users.noreply.github.com')
        git('read-tree','--empty',env=env)
        git('update-index','--add','--cacheinfo',f'100644,{blob},news.json',env=env)
        tree=git('write-tree',env=env).stdout.strip()
        args=['commit-tree',tree]+(['-p',parent] if parent else [])
        sha=git(*args,input='data: publish latest collected edition\n',env=env).stdout.strip()
        git('push','origin',f'{sha}:{REF}')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['load','save']);parser.add_argument('path');args=parser.parse_args()
    try:(load if args.action=='load' else save)(args.path)
    except RuntimeError as exc:print(str(exc));return 1
    return 0

if __name__=='__main__':raise SystemExit(main())
