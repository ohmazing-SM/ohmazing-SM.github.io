(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.BOARD_CONFIG || {};
  const PAGE_SIZE = 12;
  let db = null, admin = false, current = null, editing = null, page = 0, ready = false, loadSeq = 0, routeSeq = 0, busy = false;
  const status = (msg = '', error = false) => { $('status').textContent = msg; $('status').hidden = !msg; $('status').classList.toggle('error', error); };
  const checked = result => { if (result.error) throw result.error; return result; };
  const date = value => new Intl.DateTimeFormat('en-CA', {year:'numeric', month:'2-digit', day:'2-digit', timeZone:'Asia/Seoul'}).format(new Date(value));
  const meta = post => `${date(post.created_at)} · Views ${Number(post.views).toLocaleString('en-US')}`;
  const postId = () => new URLSearchParams(location.search).get('post');
  const setRoute = id => { const url = new URL(location.href); if(id) url.searchParams.set('post',id); else url.searchParams.delete('post'); history.pushState(null,'',url); };
  const report = err => status(err?.message || 'Something went wrong. Please try again.', true);
  function controls() {
    $('loginBtn').hidden = !db || admin;
    $('logoutBtn').hidden = !admin;
    $('writeBtn').hidden = !admin;
    $('ownerActions').hidden = !admin;
  }
  function panel(name) { for (const id of ['listPanel','articlePanel','editor']) $(id).hidden = id !== name; }
  async function guarded(button, action) {
    if (busy) return;
    busy = true; button.disabled = true; status();
    try { await action(); } catch(err) { report(err); }
    finally { busy = false; button.disabled = false; }
  }
  async function authState() {
    const {data:{user},error} = await db.auth.getUser();
    admin = false;
    if (error && error.name !== 'AuthSessionMissingError') throw error;
    if(user) {
      const {data} = checked(await db.from('board_admins').select('user_id').eq('user_id',user.id).maybeSingle());
      admin = Boolean(data);
      if (!admin) await db.auth.signOut();
    }
    controls();
  }
  async function listPosts() {
    const sequence = ++loadSeq;
    panel('listPanel'); current = null; editing = null;
    const query = $('searchInput').value.trim();
    let rows, count;
    let req = db.from('board_posts').select('id,title,created_at,views',{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false});
    if(query) req = req.ilike('title',`%${query.replace(/[\\%_]/g,'\\$&')}%`);
    const res = checked(await req.range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1)); rows = res.data; count = res.count || 0;
    if(sequence !== loadSeq) return;
    if(page > 0 && rows.length === 0 && count > 0) { page = Math.ceil(count/PAGE_SIZE)-1; return listPosts(); }
    if(sequence !== loadSeq || $('listPanel').hidden) return;
    const root = $('posts'); root.replaceChildren();
    if(!rows.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state';
      const heading = document.createElement('p'); heading.className = 'empty-title'; heading.textContent = query ? 'No matching posts' : 'No Posts Yet';
      const sub = document.createElement('p'); sub.className = 'empty-sub'; sub.textContent = query ? 'Try a different search.' : 'New posts will appear here.';
      empty.append(heading,sub); root.append(empty);
    } else for(const post of rows) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'post-row';
      const title = document.createElement('span'); title.className = 'post-title'; title.textContent = post.title;
      const info = document.createElement('span'); info.className = 'post-meta'; info.textContent = meta(post);
      row.append(title,info); row.addEventListener('click',() => { setRoute(post.id); showRoute().catch(report); }); root.append(row);
    }
    const pages = Math.max(1,Math.ceil(count/PAGE_SIZE));
    $('pagination').hidden = pages <= 1; $('pageLabel').textContent = `${page+1} / ${pages}`; $('prevBtn').disabled = page === 0; $('nextBtn').disabled = page+1 >= pages;
  }
  async function readPost(id, countView = true, sequence = routeSeq) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Post not found.');
    let post;
    if(countView) checked(await db.rpc('board_record_view',{post_id:id}));
    post = checked(await db.from('board_posts').select('id,title,body,created_at,updated_at,views').eq('id',id).maybeSingle()).data;
    if(sequence !== routeSeq) return;
    if(!post) { setRoute(null); await listPosts(); throw new Error('Post not found.'); }
    current = post; editing = null; panel('articlePanel');
    $('articleTitle').textContent = post.title; $('articleMeta').textContent = meta(post); $('articleBody').textContent = post.body; controls();
  }
  async function showRoute() {
    const sequence = ++routeSeq; ++loadSeq; status(); $('loginForm').hidden = true;
    const id = postId(); if(id) await readPost(id,true,sequence); else await listPosts();
  }
  function openEditor(post) {
    if(!admin) return;
    ++routeSeq; ++loadSeq; status(); $('loginForm').hidden = true;
    editing = post?.id || null; $('editorHeading').textContent = post ? 'Edit Post' : 'Write Post';
    $('titleInput').value = post?.title || ''; $('bodyInput').value = post?.body || ''; $('publishBtn').textContent = post ? 'Save Changes' : 'Publish'; panel('editor'); $('titleInput').focus();
  }
  $('editor').addEventListener('submit',e => {
    e.preventDefault(); if(!admin) return;
    guarded($('publishBtn'), async () => {
      const title = $('titleInput').value.trim(), body = $('bodyInput').value.trim(); if(!title || !body) throw new Error('Enter a title and content.');
      let id = editing;
      if(id) {
        checked(await db.from('board_posts').update({title,body}).eq('id',id).select('id').single());
      } else {
        id = checked(await db.from('board_posts').insert({title,body}).select('id').single()).data.id;
      }
      if(postId()!==id) setRoute(id); await readPost(id,false,++routeSeq); status('Post saved.');
    });
  });
  $('deleteBtn').addEventListener('click',() => { if(!admin || !current || !confirm('Delete this post permanently?')) return;
    guarded($('deleteBtn'),async () => { const id = current.id; checked(await db.from('board_posts').delete().eq('id',id).select('id').single()); setRoute(null); await showRoute(); status('Post deleted.'); });
  });
  $('loginBtn').addEventListener('click',() => { $('loginForm').hidden = false; $('email').focus(); });
  $('cancelLogin').addEventListener('click',() => { $('loginForm').hidden = true; $('password').value = ''; });
  $('loginForm').addEventListener('submit',e => { e.preventDefault(); guarded(e.currentTarget.querySelector('[type=submit]'),async () => {
    try { checked(await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value})); await authState(); if(!admin) throw new Error('This account is not authorized to manage the board.'); $('loginForm').hidden = true; status('Administrator signed in.'); }
    finally { $('password').value = ''; }
  }); });
  $('logoutBtn').addEventListener('click',() => guarded($('logoutBtn'),async () => { checked(await db.auth.signOut()); admin = false; controls(); await showRoute(); status('Signed out.'); }));
  $('writeBtn').addEventListener('click',() => { if(!$('editor').hidden) return; openEditor(null); });
  $('editBtn').addEventListener('click',() => openEditor(current));
  $('cancelEdit').addEventListener('click',() => { const id=postId(); if(id) readPost(id,false,++routeSeq).catch(report); else showRoute().catch(report); });
  $('backBtn').addEventListener('click',() => { setRoute(null); showRoute().catch(report); });
  $('copyBtn').addEventListener('click',() => guarded($('copyBtn'),async () => { await navigator.clipboard.writeText(location.href); status('Link copied.'); }));
  let searchTimer; $('searchInput').addEventListener('input',() => { clearTimeout(searchTimer); searchTimer=setTimeout(()=>{ if(!$('listPanel').hidden) { page=0; listPosts().catch(report); } },200); });
  $('prevBtn').addEventListener('click',() => { if(page>0) { page--; listPosts().catch(report); } });
  $('nextBtn').addEventListener('click',() => { page++; listPosts().catch(report); });
  window.addEventListener('popstate',() => { if(ready) showRoute().catch(report); });
  async function init() {
    if(!config.supabaseUrl || !config.supabasePublishableKey) { $('setupNotice').hidden=false; return; }
    if(!window.supabase) await new Promise((resolve,reject) => { const script=document.createElement('script'); script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'; script.onload=resolve; script.onerror=()=>reject(new Error('The board service could not load. Please reload the page.')); document.head.append(script); });
    if(!window.supabase) throw new Error('The board service could not load. Please reload the page.');
    db=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
    await authState(); ready=true; await showRoute();
  }
  init().catch(report);
})();
