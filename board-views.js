(() => {
  'use strict';
  const key='academic-board-visitor-v3';
  let volatileId;
  function visitor() {
    try { let id=localStorage.getItem(key); if(!id||!/^[0-9a-f-]{36}$/i.test(id)){id=crypto.randomUUID();localStorage.setItem(key,id);} return id; }
    catch {return volatileId||(volatileId=crypto.randomUUID());}
  }
  window.BoardViews={record:async(db,id)=>{
    const result=await db.rpc('board_record_view_v3',{p_post_id:id,p_visitor_id:visitor()});
    if(result.error) throw result.error; return result.data;
  }};
})();
