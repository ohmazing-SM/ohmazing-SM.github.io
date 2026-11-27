(() => {
  const root=document.getElementById('staticArticle');if(root&&window.BoardContent)BoardContent.renderMath(root);
  async function update(){const info=document.getElementById('liveViews'),id=info?.dataset.postId,c=window.BOARD_CONFIG;if(!id||!c?.supabaseUrl||!c?.supabasePublishableKey||!window.supabase)return;try{const db=supabase.createClient(c.supabaseUrl,c.supabasePublishableKey);const count=await BoardViews.record(db,id);if(typeof count==='number')info.textContent=Number(count).toLocaleString('en-US');else if(count===null)info.textContent='Unavailable';}catch(e){console.warn('Live view count unavailable',e);}}
  update();
})();
