# 🚗 Castro Veículos

Site de revenda de veículos com painel administrativo.

## Tecnologias

- **Backend:** Node.js + Express (serverless no Vercel)
- **Frontend:** HTML, CSS, JavaScript puro
- **E-mail:** Nodemailer (Gmail)
- **Relatórios:** ExcelJS

## Deploy no Vercel

### 1. Clone o repositório

```bash
git clone https://github.com/Guilherme-Henrique-Rizo/castro-veiculos001.git
cd castro-veiculos001
```

### 2. Configure as variáveis de ambiente no Vercel

No painel do Vercel → Settings → Environment Variables, adicione:

| Variável | Descrição |
|---|---|
| `ADMIN_SENHA` | Senha do painel admin (padrão: `castro123`) |
| `EMAIL_DESTINO` | E-mail que receberá os contatos |
| `SMTP_USER` | Seu Gmail |
| `SMTP_PASS` | Senha de app do Gmail (16 caracteres) |

### 3. Deploy automático

Conecte o repositório ao Vercel e faça push para `main`. O Vercel detecta automaticamente o `vercel.json`.

## Rodando localmente

```bash
npm install
cp .env.example .env   # edite com suas credenciais
npm run dev
```

Acesse: http://localhost:3000  
Admin: http://localhost:3000/admin.html

## ⚠️ Nota sobre banco de dados

O Vercel é **serverless** — o disco é efêmero. Os dados em memória são zerados a cada cold start.  
Para persistência real, integre um banco externo:

- **[Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)** (recomendado)
- **[Turso](https://turso.tech/)** (SQLite distribuído)
- **[PlanetScale](https://planetscale.com/)** (MySQL serverless)

Edite `api/index.js` para substituir os arrays em memória pela conexão ao banco escolhido.
