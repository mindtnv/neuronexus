import { GlobalRegistrator, ensureTestDom } from '@/lib/test-dom-setup';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { decorateCodeBlocks, copyCodeText } from './code-copy';
beforeAll(ensureTestDom);
afterAll(async () => { try { await GlobalRegistrator.unregister(); } catch {} });
test('line gutter preserves highlighted source and decoration is idempotent', async () => {
  const root = document.createElement('div');
  root.innerHTML = '<pre><code class="hljs language-csharp"><span class="hljs-keyword">yield</span> return 1;\n// line two\n</code></pre>';
  document.body.append(root);
  const before = root.querySelector('code')!.textContent;
  decorateCodeBlocks(root,{copy:'Copy code',copied:'Copied'});
  decorateCodeBlocks(root,{copy:'Copy code',copied:'Copied'});
  expect(root.querySelectorAll('.nn-code-block')).toHaveLength(1);
  expect(root.querySelector('.nn-code-lines')!.textContent).toBe('1\n2');
  expect(root.querySelector('code')!.textContent).toBe(before);
  expect(root.querySelector('.hljs-keyword')!.textContent).toBe('yield');
  let copied = '';
  const descriptor = Object.getOwnPropertyDescriptor(navigator,'clipboard');
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async (text:string)=>{copied=text;}}});
  try {
    (root.querySelector('button') as HTMLButtonElement).click();
    await Promise.resolve(); await Promise.resolve();
    expect(copied).toBe(before!);
    expect(copied).not.toContain('Copy');
  } finally {
    if(descriptor) Object.defineProperty(navigator,'clipboard',descriptor); else delete (navigator as any).clipboard;
    root.remove();
  }
});
test('private HTTP fallback copies plain text and cleans its temporary input', async () => {
  const clipboard = Object.getOwnPropertyDescriptor(navigator,'clipboard');
  const exec = document.execCommand;
  let copied = '';
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});
  document.execCommand = () => { copied = (document.activeElement as HTMLTextAreaElement).value; return true; };
  try { await copyCodeText('a\nb\n'); expect(copied).toBe('a\nb\n'); expect(document.querySelector('textarea')).toBeNull(); }
  finally { document.execCommand=exec; if(clipboard) Object.defineProperty(navigator,'clipboard',clipboard); else delete (navigator as any).clipboard; }
});
