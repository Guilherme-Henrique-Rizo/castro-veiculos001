require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const path = require('path');
const crypto = require('crypto');

const app = express();

// ── Banco de dados ──────────────────────────────────────────────────────────
// No Vercel (serverless) o disco é efêmero. Para persistência real, use
// Vercel Postgres, PlanetScale, Turso ou similar e configure DATABASE_URL.
// Esta versão usa uma store em memória para demonstração / deploy inicial.
// Substitua pela lógica de DB da sua escolha via variáveis de ambiente.

let veiculos = [];
let fotos = [];
let contatos = [];
let nextVeiculoId = 1;
let nextFotoId = 1;
let nextContatoId = 1;

const tokens = new Set();

// ── Middlewares ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const auth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (tokens.has(token)) return next();
  res.status(401).json({ erro: 'Não autorizado' });
};

const comFotos = (v) => ({
  ...v,
  fotos: fotos.filter(f => f.veiculo_id === v.id).map(f => '/uploads/' + f.arquivo),
});

// ── API pública ─────────────────────────────────────────────────────────────
app.get('/api/veiculos', (req, res) => {
  const disponiveis = veiculos
    .filter(v => !v.vendido)
    .sort((a, b) => b.id - a.id)
    .map(comFotos);
  res.json(disponiveis);
});

app.post('/api/contato', async (req, res) => {
  const { nome, telefone, email, assunto } = req.body || {};
  if (!nome || !telefone || !email || !assunto)
    return res.status(400).json({ erro: 'Preencha todos os campos.' });

  const novoContato = {
    id: nextContatoId++,
    nome, telefone, email, assunto,
    vendido: 0,
    criado_em: new Date().toISOString(),
  };
  contatos.push(novoContato);

  let enviado = false;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await nodemailer
        .createTransport({
          service: 'gmail',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        })
        .sendMail({
          from: process.env.SMTP_USER,
          to: process.env.EMAIL_DESTINO || 'zanettecastro@gmail.com',
          replyTo: email,
          subject: 'Novo contato do site: ' + assunto,
          text: `Nome: ${nome}\nTelefone: ${telefone}\nE-mail: ${email}\nAssunto: ${assunto}`,
        });
      enviado = true;
    } catch (e) {
      console.error('Falha no e-mail:', e.message);
    }
  }
  res.json({ ok: true, enviado });
});

// ── API Admin ───────────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const senhaCorreta = process.env.ADMIN_SENHA || 'castro123';
  if (req.body.senha && req.body.senha === senhaCorreta) {
    const t = crypto.randomBytes(24).toString('hex');
    tokens.add(t);
    return res.json({ token: t });
  }
  res.status(401).json({ erro: 'Senha incorreta' });
});

app.get('/api/admin/veiculos', auth, (req, res) => {
  res.json(veiculos.sort((a, b) => b.id - a.id).map(comFotos));
});

app.post('/api/admin/veiculos', auth, (req, res) => {
  const { nome, tipo, valor, ano, cor, descricao } = req.body;
  if (!nome || !tipo || !valor)
    return res.status(400).json({ erro: 'Nome, tipo e valor são obrigatórios.' });

  const id = nextVeiculoId++;
  const novoVeiculo = {
    id, nome, tipo,
    valor: parseFloat(valor),
    ano: ano || null,
    cor: cor || null,
    descricao: descricao || null,
    vendido: 0,
    criado_em: new Date().toISOString(),
    vendido_em: null,
  };
  veiculos.push(novoVeiculo);

  // Fotos: no Vercel, o upload de arquivos requer storage externo (ex: Vercel Blob, S3).
  // Por ora, aceita URLs de fotos enviadas como JSON array em req.body.fotos_urls
  const fotosUrls = req.body.fotos_urls || [];
  fotosUrls.forEach(url => {
    fotos.push({ id: nextFotoId++, veiculo_id: id, arquivo: url });
  });

  res.json({ ok: true, id });
});

app.put('/api/admin/veiculos/:id/vendido', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const v = veiculos.find(x => x.id === id);
  if (!v) return res.status(404).json({ erro: 'Veículo não encontrado' });
  v.vendido = req.body.vendido ? 1 : 0;
  v.vendido_em = req.body.vendido ? new Date().toISOString() : null;
  res.json({ ok: true });
});

app.delete('/api/admin/veiculos/:id', auth, (req, res) => {
  const id = parseInt(req.params.id);
  veiculos = veiculos.filter(x => x.id !== id);
  fotos = fotos.filter(f => f.veiculo_id !== id);
  res.json({ ok: true });
});

app.get('/api/admin/contatos', auth, (req, res) => {
  res.json(contatos.sort((a, b) => b.id - a.id));
});

app.put('/api/admin/contatos/:id/vendido', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const c = contatos.find(x => x.id === id);
  if (!c) return res.status(404).json({ erro: 'Contato não encontrado' });
  c.vendido = req.body.vendido ? 1 : 0;
  res.json({ ok: true });
});

app.get('/api/admin/excel', auth, async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const cols = [
    ['ID', 'id'], ['Veículo', 'nome'], ['Tipo', 'tipo'],
    ['Valor (R$)', 'valor'], ['Ano', 'ano'], ['Cor', 'cor'],
    ['Cadastrado em', 'criado_em'], ['Vendido em', 'vendido_em'],
  ];

  const sheet = (nome, rows, cs) => {
    const ws = wb.addWorksheet(nome);
    ws.columns = cs.map(([h, k]) => ({ header: h, key: k, width: h.length + 16 }));
    rows.forEach(r => ws.addRow(r));
    ws.getRow(1).eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF26B1D' } };
    });
  };

  sheet('Veículos vendidos', veiculos.filter(v => v.vendido), cols);
  sheet('Veículos não vendidos', veiculos.filter(v => !v.vendido), cols);
  sheet('Contatos', contatos.map(c => ({
    ...c, status: c.vendido ? 'Vendido' : 'Não vendido',
  })), [
    ['ID', 'id'], ['Nome', 'nome'], ['Telefone', 'telefone'],
    ['E-mail', 'email'], ['Assunto', 'assunto'], ['Status', 'status'], ['Data', 'criado_em'],
  ]);

  res.setHeader('Content-Disposition', 'attachment; filename=castro-relatorio.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await wb.xlsx.write(res);
  res.end();
});

// Fallback → index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Exporta para Vercel Serverless
module.exports = app;

// Permite rodar localmente também
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () =>
    console.log(`Castro Veículos em http://localhost:${PORT}  |  admin: /admin.html`)
  );
}
