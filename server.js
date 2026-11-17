require('dotenv').config();
const express=require('express'),Database=require('better-sqlite3'),multer=require('multer'),
nodemailer=require('nodemailer'),ExcelJS=require('exceljs'),path=require('path'),fs=require('fs'),crypto=require('crypto');
const app=express(),db=new Database('castro.db');
db.pragma('foreign_keys=ON');
fs.mkdirSync('uploads',{recursive:true});
db.exec(`
CREATE TABLE IF NOT EXISTS veiculos(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT NOT NULL,tipo TEXT NOT NULL,
 valor REAL NOT NULL,ano INTEGER,cor TEXT,descricao TEXT,vendido INTEGER DEFAULT 0,
 criado_em TEXT DEFAULT CURRENT_TIMESTAMP,vendido_em TEXT);
CREATE TABLE IF NOT EXISTS fotos(id INTEGER PRIMARY KEY AUTOINCREMENT,
 veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,arquivo TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS contatos(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT,telefone TEXT,email TEXT,
 assunto TEXT,vendido INTEGER DEFAULT 0,criado_em TEXT DEFAULT CURRENT_TIMESTAMP);`);

const upload=multer({storage:multer.diskStorage({destination:'uploads',
 filename:(r,f,cb)=>cb(null,Date.now()+'-'+crypto.randomBytes(4).toString('hex')+path.extname(f.originalname).toLowerCase())}),
 limits:{fileSize:8*1024*1024},fileFilter:(r,f,cb)=>cb(null,/^image\//.test(f.mimetype))});
app.use(express.json());
app.use('/uploads',express.static('uploads'));
app.use(express.static('public'));

const tokens=new Set();
const auth=(req,res,next)=>tokens.has((req.headers.authorization||'').replace('Bearer ',''))?next():res.status(401).json({erro:'Não autorizado'});
const comFotos=v=>({...v,fotos:db.prepare('SELECT arquivo FROM fotos WHERE veiculo_id=?').all(v.id).map(f=>'/uploads/'+f.arquivo)});

// ---------- Site do cliente ----------
app.get('/api/veiculos',(req,res)=>
 res.json(db.prepare('SELECT * FROM veiculos WHERE vendido=0 ORDER BY id DESC').all().map(comFotos)));

app.post('/api/contato',async(req,res)=>{
 const {nome,telefone,email,assunto}=req.body||{};
 if(!nome||!telefone||!email||!assunto)return res.status(400).json({erro:'Preencha todos os campos.'});
 db.prepare('INSERT INTO contatos(nome,telefone,email,assunto) VALUES(?,?,?,?)').run(nome,telefone,email,assunto);
 let enviado=false;
 if(process.env.SMTP_USER&&process.env.SMTP_PASS){
  try{
   await nodemailer.createTransport({service:'gmail',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}).sendMail({
    from:process.env.SMTP_USER,to:process.env.EMAIL_DESTINO||'zanettecastro@gmail.com',replyTo:email,
    subject:'Novo contato do site: '+assunto,
    text:`Nome: ${nome}\nTelefone: ${telefone}\nE-mail: ${email}\nAssunto: ${assunto}`});
   enviado=true;
  }catch(e){console.error('Falha no e-mail:',e.message)}
 }
 res.json({ok:true,enviado});
});

// ---------- Admin ----------
app.post('/api/admin/login',(req,res)=>{
 if(req.body.senha&&req.body.senha===(process.env.ADMIN_SENHA||'castro123')){
  const t=crypto.randomBytes(24).toString('hex');tokens.add(t);return res.json({token:t});}
 res.status(401).json({erro:'Senha incorreta'});
});
app.get('/api/admin/veiculos',auth,(q,res)=>res.json(db.prepare('SELECT * FROM veiculos ORDER BY id DESC').all().map(comFotos)));
app.post('/api/admin/veiculos',auth,upload.array('fotos',10),(req,res)=>{
 const {nome,tipo,valor,ano,cor,descricao}=req.body;
 if(!nome||!tipo||!valor)return res.status(400).json({erro:'Nome, tipo e valor são obrigatórios.'});
 const id=db.prepare('INSERT INTO veiculos(nome,tipo,valor,ano,cor,descricao) VALUES(?,?,?,?,?,?)')
  .run(nome,tipo,parseFloat(valor),ano||null,cor||null,descricao||null).lastInsertRowid;
 (req.files||[]).forEach(f=>db.prepare('INSERT INTO fotos(veiculo_id,arquivo) VALUES(?,?)').run(id,f.filename));
 res.json({ok:true,id});
});
app.put('/api/admin/veiculos/:id/vendido',auth,(req,res)=>{
 const v=req.body.vendido?1:0;
 db.prepare("UPDATE veiculos SET vendido=?,vendido_em=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP END WHERE id=?").run(v,v,req.params.id);
 res.json({ok:true});
});
app.delete('/api/admin/veiculos/:id',auth,(req,res)=>{
 db.prepare('SELECT arquivo FROM fotos WHERE veiculo_id=?').all(req.params.id).forEach(f=>fs.rmSync(path.join('uploads',f.arquivo),{force:true}));
 db.prepare('DELETE FROM veiculos WHERE id=?').run(req.params.id);res.json({ok:true});
});
app.get('/api/admin/contatos',auth,(q,res)=>res.json(db.prepare('SELECT * FROM contatos ORDER BY id DESC').all()));
app.put('/api/admin/contatos/:id/vendido',auth,(req,res)=>{
 db.prepare('UPDATE contatos SET vendido=? WHERE id=?').run(req.body.vendido?1:0,req.params.id);res.json({ok:true});
});
app.get('/api/admin/excel',auth,async(req,res)=>{
 const wb=new ExcelJS.Workbook();
 const cols=[['ID','id'],['Veículo','nome'],['Tipo','tipo'],['Valor (R$)','valor'],['Ano','ano'],['Cor','cor'],['Cadastrado em','criado_em'],['Vendido em','vendido_em']];
 const sheet=(nome,rows,cs)=>{const ws=wb.addWorksheet(nome);
  ws.columns=cs.map(([h,k])=>({header:h,key:k,width:h.length+16}));
  rows.forEach(r=>ws.addRow(r));
  ws.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF26B1D'}}});};
 sheet('Veículos vendidos',db.prepare('SELECT * FROM veiculos WHERE vendido=1').all(),cols);
 sheet('Veículos não vendidos',db.prepare('SELECT * FROM veiculos WHERE vendido=0').all(),cols);
 sheet('Contatos',db.prepare("SELECT *,CASE vendido WHEN 1 THEN 'Vendido' ELSE 'Não vendido' END status FROM contatos").all(),
  [['ID','id'],['Nome','nome'],['Telefone','telefone'],['E-mail','email'],['Assunto','assunto'],['Status','status'],['Data','criado_em']]);
 res.setHeader('Content-Disposition','attachment; filename=castro-relatorio.xlsx');
 res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 await wb.xlsx.write(res);res.end();
});
app.listen(process.env.PORT||3000,()=>console.log('Castro Veículos em http://localhost:'+(process.env.PORT||3000)+'  |  admin: /admin.html'));
