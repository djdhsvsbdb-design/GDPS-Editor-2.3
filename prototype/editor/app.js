(()=>{
const canvas=document.querySelector('#levelCanvas'),ctx=canvas.getContext('2d');
const $=s=>document.querySelector(s);
const labels={block:'Блок',spike:'Шип',platform:'Платформа',orb:'Сфера',portal:'Портал',saw:'Пила'};
let objects=[{id:1,kind:'block',x:170,y:440},{id:2,kind:'spike',x:300,y:440},{id:3,kind:'platform',x:430,y:410},{id:4,kind:'saw',x:650,y:430}];
let selected=null,kind='block',tool='select',zoom=1,bg='violet',history=[],future=[],testing=false,nextId=5;
const snap=()=>$('#snapToggle').checked?20:1;
function snapshot(){history.push(JSON.stringify(objects));if(history.length>60)history.shift();future=[]}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1400)}
function draw(){
 const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
 const colors={violet:['#170b2a','#25103c'],blue:['#071c30','#0d3150'],dark:['#090b12','#171b28']}[bg];
 const grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,colors[0]);grad.addColorStop(1,colors[1]);ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
 if($('#gridToggle').checked){ctx.strokeStyle='#9e65d51c';ctx.lineWidth=1;for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}}
 ctx.fillStyle='#a94cff';ctx.shadowColor='#9e43ff';ctx.shadowBlur=15;ctx.fillRect(0,500,w,4);ctx.shadowBlur=0;
 objects.forEach(o=>{ctx.save();ctx.translate(o.x,o.y);ctx.lineWidth=4;ctx.strokeStyle='#d7a5ff';ctx.fillStyle=o.kind==='orb'?'#31ddff':'#7e2bd1';ctx.shadowColor='#a34dff';ctx.shadowBlur=12;
 if(o.kind==='block'){ctx.fillRect(-25,-25,50,50);ctx.strokeRect(-25,-25,50,50)}
 if(o.kind==='spike'){ctx.beginPath();ctx.moveTo(-25,25);ctx.lineTo(0,-25);ctx.lineTo(25,25);ctx.closePath();ctx.fill();ctx.stroke()}
 if(o.kind==='platform'){ctx.fillRect(-42,-9,84,18);ctx.strokeRect(-42,-9,84,18)}
 if(o.kind==='orb'){ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.fill();ctx.stroke()}
 if(o.kind==='portal'){ctx.beginPath();ctx.ellipse(0,0,17,30,0,0,Math.PI*2);ctx.stroke();ctx.lineWidth=7;ctx.strokeStyle='#29dfff';ctx.beginPath();ctx.ellipse(0,0,9,23,0,0,Math.PI*2);ctx.stroke()}
 if(o.kind==='saw'){ctx.beginPath();for(let i=0;i<24;i++){const a=i*Math.PI/12,r=i%2?19:30;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke()}
 if(selected===o.id){ctx.shadowBlur=0;ctx.strokeStyle='#31e5ff';ctx.setLineDash([7,5]);ctx.strokeRect(-37,-37,74,74)}
 ctx.restore()});
 $('#objectCount').textContent='ОБЪЕКТОВ: '+objects.length;
}
function select(id){selected=id;const o=objects.find(x=>x.id===id);$('#emptyProperties').hidden=!!o;$('#properties').hidden=!o;if(o){$('#propType').value=labels[o.kind];$('#propX').value=o.x;$('#propY').value=o.y}draw()}
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
canvas.addEventListener('pointerdown',e=>{if(testing)return;const p=canvasPoint(e);const hit=[...objects].reverse().find(o=>Math.abs(o.x-p.x)<38&&Math.abs(o.y-p.y)<38);
 if(tool==='erase'){if(hit){snapshot();objects=objects.filter(o=>o.id!==hit.id);select(null)}return}
 if(tool==='select'&&hit){select(hit.id);return}
 if(tool==='move'&&hit){select(hit.id);return}
 if(tool==='select'||tool==='move'){const s=snap();snapshot();objects.push({id:nextId++,kind,x:Math.round(p.x/s)*s,y:Math.round(p.y/s)*s});select(objects.at(-1).id);$('#saveState').textContent='ЕСТЬ ИЗМЕНЕНИЯ'}
});
document.querySelectorAll('.object').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;document.querySelectorAll('.object').forEach(x=>x.classList.toggle('active',x===b));toast('Выбран объект: '+labels[kind])});
document.querySelectorAll('.tool').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;document.querySelectorAll('.tool').forEach(x=>x.classList.toggle('active',x===b));toast('Инструмент: '+b.textContent.trim())});
function updateProp(axis,val){const o=objects.find(x=>x.id===selected);if(!o)return;snapshot();o[axis]=Number(val)||0;draw();$('#saveState').textContent='ЕСТЬ ИЗМЕНЕНИЯ'}
$('#propX').onchange=e=>updateProp('x',e.target.value);$('#propY').onchange=e=>updateProp('y',e.target.value);
$('#deleteSelected').onclick=()=>{if(selected==null)return;snapshot();objects=objects.filter(o=>o.id!==selected);select(null)};
$('#undoBtn').onclick=()=>{if(!history.length)return;future.push(JSON.stringify(objects));objects=JSON.parse(history.pop());select(null)};
$('#redoBtn').onclick=()=>{if(!future.length)return;history.push(JSON.stringify(objects));objects=JSON.parse(future.pop());select(null)};
$('#zoomIn').onclick=()=>{zoom=Math.min(2,zoom+.1);$('#zoomValue').textContent=Math.round(zoom*100)+'%';canvas.style.transform='scale('+zoom+')';canvas.style.transformOrigin='center center'};
$('#zoomOut').onclick=()=>{zoom=Math.max(.6,zoom-.1);$('#zoomValue').textContent=Math.round(zoom*100)+'%';canvas.style.transform='scale('+zoom+')';canvas.style.transformOrigin='center center'};
$('#bgSelect').onchange=e=>{bg=e.target.value;draw()};
$('#nameInput').oninput=e=>{const label=$('#levelName');if(label)label.textContent=e.target.value};
const renameButton=$('#renameBtn');if(renameButton)renameButton.onclick=()=>{$('#nameInput').focus();$('#nameInput').select()};
function data(){return {format:'gdps-editor-level',version:1,name:$('#nameInput').value,background:bg,objects}}
function download(){const blob=new Blob([JSON.stringify(data(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='gdps-level.json';a.click();URL.revokeObjectURL(a.href)}
/* Save is handled by the application shell; export remains a separate action. */
$('#exportBtn').onclick=download;
$('#importBtn').onclick=()=>$('#fileInput').click();
$('#fileInput').onchange=async e=>{try{const d=JSON.parse(await e.target.files[0].text());if(d.format!=='gdps-editor-level'||!Array.isArray(d.objects))throw Error();snapshot();objects=d.objects;nextId=Math.max(0,...objects.map(o=>o.id))+1;$('#nameInput').value=d.name||'Импортированный уровень';$('#levelName').textContent=$('#nameInput').value;bg=d.background||'violet';$('#bgSelect').value=bg;select(null);toast('Уровень загружен')}catch{toast('Не удалось прочитать файл уровня')}e.target.value=''};
$('#testBtn').onclick=()=>{testing=!testing;$('#testBtn').textContent=testing?'■ ВЫЙТИ ИЗ ТЕСТА':'▶ ТЕСТ УРОВНЯ';toast(testing?'Режим просмотра включён':'Режим просмотра выключен')};
draw();window.GDPSLevel={getObjects:()=>JSON.parse(JSON.stringify(objects)),load:p=>{objects=JSON.parse(JSON.stringify(p.objects||[]));nextId=Math.max(0,...objects.map(o=>o.id))+1;bg=p.background||'violet';$('#bgSelect').value=bg;select(null);draw()}};$('#gridToggle').addEventListener('change',draw);
})();