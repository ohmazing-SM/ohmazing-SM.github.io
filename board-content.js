(() => {
  'use strict';
  const TAGS = 'p div br b strong i em u s strike sub sup h2 h3 h4 ul ol li blockquote pre code a img table thead tbody tr th td span font hr'.split(' ');
  const ATTRS = 'href src alt title width color size align class colspan rowspan'.split(' ');
  const mediaPrefix = () => (window.BOARD_CONFIG?.supabaseUrl || '').replace(/\/$/,'') + '/storage/v1/object/public/board-media/';
  function clean(html) {
    if (!window.DOMPurify) throw new Error('The content protection library did not load. Reload and try again.');
    const fragment=DOMPurify.sanitize(html,{ALLOWED_TAGS:TAGS,ALLOWED_ATTR:ATTRS,ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,RETURN_DOM_FRAGMENT:true});
    for(const el of fragment.querySelectorAll('*')) {
      const cls=el.getAttribute('class'); if(cls && !['math-inline','math-block'].includes(cls)) el.removeAttribute('class');
      for(const attr of ['src','href']) if(el.hasAttribute(attr)) {
        const raw=el.getAttribute(attr); let url; try {url=new URL(raw);} catch {el.removeAttribute(attr);continue;}
        if(url.protocol!=='https:' || (attr==='src' && (!window.BOARD_CONFIG?.supabaseUrl || !url.href.startsWith(mediaPrefix())))) el.removeAttribute(attr);
      }
      if(el.tagName==='IMG' && !el.hasAttribute('src')) {el.remove();continue;}
      if(el.tagName==='A') {el.setAttribute('rel','noopener noreferrer');el.setAttribute('target','_blank');}
      if(el.hasAttribute('width')&&!/^(?:[1-9][0-9]{0,3}|[1-9][0-9]?%|100%)$/.test(el.getAttribute('width'))) el.removeAttribute('width');
      if(el.hasAttribute('color')&&!/^#[0-9a-f]{6}$/i.test(el.getAttribute('color'))) el.removeAttribute('color');
      if(el.hasAttribute('size')&&!/^[1-7]$/.test(el.getAttribute('size'))) el.removeAttribute('size');
      if(el.hasAttribute('align')&&!/^(left|center|right|justify)$/.test(el.getAttribute('align'))) el.removeAttribute('align');
    }
    return fragment;
  }
  function htmlOf(fragment) {const div=document.createElement('div');div.append(fragment);return div.innerHTML;}
  function plainToHtml(text) {const p=document.createElement('div');p.textContent=text||'';return p.innerHTML.replace(/\r?\n/g,'<br>');}
  function renderMath(root) {if(!window.katex)return; for(const el of root.querySelectorAll('.math-inline,.math-block')) {if(el.dataset.rendered) continue;const tex=el.textContent; try{katex.render(tex,el,{displayMode:el.classList.contains('math-block'),throwOnError:false,trust:false,maxExpand:100,maxSize:20});el.dataset.rendered='1';}catch{el.textContent=tex;}}}
  function render(root,post) {root.classList.toggle('rich-content',post.content_format==='html'); if(post.content_format==='html'){root.replaceChildren(clean(post.body));renderMath(root);}else root.textContent=post.body;}
  window.BoardContent={clean,htmlOf,plainToHtml,render,renderMath,mediaPrefix};
})();
