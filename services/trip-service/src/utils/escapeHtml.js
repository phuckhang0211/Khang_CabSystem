const entities={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function escapeHtml(value){return String(value).replace(/[&<>"']/g,(char)=>entities[char]);}
module.exports={escapeHtml};
