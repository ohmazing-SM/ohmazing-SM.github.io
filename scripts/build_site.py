"""Build a Pages artifact; all DB requests use the existing public read key, not service_role."""
import argparse, html, json, re, shutil, urllib.parse, urllib.request, uuid
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, ElementTree
import bleach
from bs4 import BeautifulSoup

BASE='https://ohmazing-sm.github.io'
PAGES=['index.html','education.html','research.html','publications.html','extracurricular.html','studies.html','board.html']
LABELS=['Home','Education','Research','Publications','Extracurricular','Studies','Board']
TAGS='p div br b strong i em u s strike sub sup h2 h3 h4 ul ol li blockquote pre code a img table thead tbody tr th td span font hr'.split()

def config(root):
    text=(root/'board-config.js').read_text()
    def val(name):
        match=re.search(r'\b'+name+r'\s*:\s*[\"\']([^\"\']+)[\"\']',text)
        if not match: raise ValueError('Missing '+name+' in existing board-config.js')
        return match[1]
    url,key=val('supabaseUrl').rstrip('/'),val('supabasePublishableKey')
    if urllib.parse.urlparse(url).scheme!='https':raise ValueError('Invalid HTTPS project URL')
    if key.startswith('sb_secret_'):raise ValueError('Do not use a secret key')
    if key.startswith('eyJ'):
        import base64
        part=key.split('.')[1];payload=json.loads(base64.urlsafe_b64decode(part+'='*((-len(part))%4)))
        if payload.get('role')!='anon':raise ValueError('Only the anon JWT key is allowed')
    elif not key.startswith('sb_publishable_'):raise ValueError('Use a publishable key')
    return url,key

def load_posts(url,key):
    rows=[]; size=100; offset=0
    while True:
        q=urllib.parse.urlencode({'select':'id,title,body,category,content_format,created_at,updated_at,views','order':'created_at.desc,id.desc','limit':size,'offset':offset})
        headers={'apikey':key,'Accept':'application/json'}
        if key.startswith('eyJ'):headers['Authorization']='Bearer '+key
        req=urllib.request.Request(url+'/rest/v1/board_posts?'+q,headers=headers)
        with urllib.request.urlopen(req,timeout=30) as f: batch=json.load(f)
        if not isinstance(batch,list):raise ValueError('Unexpected DB response')
        rows+=batch
        if len(batch)<size:return rows
        offset+=size
        if offset>100000:raise ValueError('Too many posts; review pagination')

def safe_html(body,url):
    prefix=url+'/storage/v1/object/public/board-media/'
    def attr(tag,name,value):
        if name in ('src','href'):
            try: parsed=urllib.parse.urlparse(value)
            except ValueError:return False
            return parsed.scheme=='https' and bool(parsed.netloc) and (name!='src' or value.startswith(prefix))
        if name=='class':return value in ('math-inline','math-block')
        if name=='width':return bool(re.fullmatch(r'([1-9][0-9]{0,3}|[1-9][0-9]?%|100%)',value))
        if name=='color':return bool(re.fullmatch(r'#[0-9a-fA-F]{6}',value))
        if name=='size':return value in '1234567' and len(value)==1
        if name=='align':return value in ('left','center','right','justify')
        if name in ('colspan','rowspan'):return bool(re.fullmatch(r'[1-9][0-9]?',value))
        return name in ('alt','title')
    clean=bleach.clean(body,tags=TAGS,attributes=attr,protocols=['https'],strip=True,strip_comments=True)
    soup=BeautifulSoup(clean,'html.parser')
    for img in soup.find_all('img'):
        if not img.get('src'): img.decompose()
        else: img['loading']='lazy'
    for link in soup.find_all('a'):link['rel']='noopener noreferrer';link['target']='_blank'
    # Re-sanitize the serialized markup; add no untrusted scripts or style attributes.
    return bleach.clean(str(soup),tags=TAGS,attributes=lambda t,n,v: attr(t,n,v) or (t=='img' and n=='loading' and v=='lazy') or (t=='a' and n=='rel' and v=='noopener noreferrer') or (t=='a' and n=='target' and v=='_blank'),protocols=['https'],strip=True,strip_comments=True)

def esc(s):return html.escape(str(s),quote=True)
def clean_text(s):return ' '.join(BeautifulSoup(s,'html.parser').get_text(' ',strip=True).split())
def write(path,content):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content,encoding='utf-8')
def build(root,out,fixture=None):
    if out.exists():shutil.rmtree(out)
    out.mkdir(parents=True)
    for item in root.iterdir():
        if item.name.startswith('.') or item.name in ('scripts','_site','posts','sitemap.xml','robots.txt','privacy.html','node_modules','__pycache__') or item.resolve()==out.resolve() or item.suffix.lower() in ('.sql','.zip','.md','.txt','.py','.yml','.yaml') and item.name not in ('robots.txt',):continue
        if item.is_dir():shutil.copytree(item,out/item.name,ignore=shutil.ignore_patterns('.git','node_modules','.env*','*.sql','*.zip'))
        elif item.is_file():shutil.copy2(item,out/item.name)
    if fixture:
        url='https://example.supabase.co'; posts=json.loads(fixture.read_text())
    else:
        url,key=config(root);posts=load_posts(url,key)
    css=BeautifulSoup((root/'board.html').read_text(),'html.parser').find('style').get_text()
    nav='<header><nav aria-label="Main navigation"><a class="logo" href="/">Seung-Mok Oh</a><ul class="nav-links">'+''.join(f'<li><a href="/{name}"'+(' class="active"' if name=='board.html' else '')+f'>{label}</a></li>' for name,label in zip(PAGES,LABELS))+'</ul></nav></header>'
    def layout(title,desc,path,body,extra='',ogtype='website'):
        return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(title)}</title><meta name="description" content="{esc(desc)}"><link rel="canonical" href="{BASE}{path}"><meta property="og:type" content="{ogtype}"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{BASE}{path}"><style>{css}</style><link rel="stylesheet" href="/board-content.css"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/katex.min.css"></head><body>{nav}<main class="container"><section class="card">{body}</section></main>{extra}<script defer src="/analytics.js"></script></body></html>'''
    sitemap=Element('urlset',xmlns='http://www.sitemaps.org/schemas/sitemap/0.9')
    def add(path,last=None):
        node=SubElement(sitemap,'url');SubElement(node,'loc').text=BASE+path
        if last:SubElement(node,'lastmod').text=str(last)[:10]
    for name in PAGES:add('/' if name=='index.html' else '/'+name)
    for name in PAGES:
        target=out/name
        text=target.read_text()
        if name=='board.html': text=text.replace('<div id="setupNotice"','<p class="editor-help"><a href="/posts/">Browse the searchable post archive</a></p><div id="setupNotice"',1)
        if not re.search(r'<meta\s+name=[\"\']description',text,re.I):
            text=re.sub(r'</head>',f'<meta name="description" content="{esc(dict(zip(PAGES,LABELS))[name])} — Academic portfolio of Seung-Mok Oh, Sogang University.">\n</head>',text,count=1,flags=re.I)
        if not re.search(r'<link\s+rel=[\"\']canonical',text,re.I):text=re.sub(r'</head>',f'<link rel="canonical" href="{BASE}{"/" if name=="index.html" else "/"+name}">\n</head>',text,count=1,flags=re.I)
        if 'src="/analytics.js"' not in text: text=re.sub(r'</body>','<script defer src="/analytics.js"></script>\n</body>',text,count=1,flags=re.I)
        write(target,text)
    items=[]
    for post in posts:
        id=str(uuid.UUID(post['id']));title=str(post['title']);category=str(post.get('category') or 'General');date=str(post['created_at'])[:10];updated=post.get('updated_at') or post['created_at'];path=f'/posts/{id}/';add(path,updated)
        if post.get('content_format')=='html':body=safe_html(post['body'],url);klass='post-body rich-content';desc=clean_text(body)[:155]
        else: body=esc(post['body']);klass='post-body';desc=' '.join(post['body'].split())[:155]
        desc=desc or title
        item=f'<a class="post-row" href="{path}"><span class="post-title"><span class="category-label">{esc(category)}</span>{esc(title)}</span><span class="post-meta">{esc(date)}</span></a>';items.append(item)
        article=f'<a class="btn secondary" href="/posts/">Back to archive</a><h1 class="article-title">{esc(title)}</h1><p class="article-meta">{esc(category)} · {esc(date)} · Views <span id="liveViews" data-post-id="{id}">{int(post.get("views",0)):,}</span></p><article id="staticArticle" class="{klass}">{body}</article><div class="article-footer"><a class="btn secondary" href="/board.html?post={id}">Open live Board post</a></div>'
        js='''<script defer src="/board-config.js"></script><script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script defer src="https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/katex.min.js"></script><script defer src="/board-content.js"></script><script defer src="/board-views.js"></script><script defer src="/post-page.js"></script>'''
        write(out/'posts'/id/'index.html',layout(title+' | Seung-Mok Oh',desc,path,article,js,'article'))
    add('/posts/'); write(out/'posts'/'index.html',layout('Post archive | Seung-Mok Oh','Academic blog posts and research notes.','/posts/','<h1 class="section-title">Post archive</h1><p class="board-intro">Searchable articles and research notes. <a href="/board.html">Live Board</a></p><div class="board-list">'+(''.join(items) or '<p>No posts yet.</p>')+'</div>'))
    add('/privacy.html'); write(out/'privacy.html',layout('Privacy | Seung-Mok Oh','Privacy information for this website.','/privacy.html','''<h1 class="section-title">Privacy</h1><div class="rich-content"><p>Board view counts use a random browser identifier stored locally and a post/date record in Supabase. The identifier is not a name or account ID; it is retained in view records unless the operator deletes older records. Browser storage can be cleared in your settings.</p><p>Optional Google Analytics measures visits, page views and traffic sources after consent. Google may use cookies or device identifiers to provide measurement. Use Analytics preferences at the bottom of the page to change your choice. Declining does not affect access. See <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.</p><p>Published posts and attachments are public. Do not submit private information. The site is hosted on GitHub Pages and uses Supabase for the board; these services may process technical logs.</p><p>Contact: <a href="mailto:osm0824@sogang.ac.kr">osm0824@sogang.ac.kr</a>.</p></div>'''))
    ElementTree(sitemap).write(out/'sitemap.xml',encoding='utf-8',xml_declaration=True)
    write(out/'robots.txt',f'User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n');write(out/'.nojekyll','')
    print(f'Built {len(posts)} static posts, sitemap, and {len(PAGES)} main pages.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path('.'));parser.add_argument('--output',type=Path,default=Path('_site'));parser.add_argument('--fixture',type=Path);args=parser.parse_args();build(args.root.resolve(),args.output.resolve(),args.fixture)
