# Castro Veículos – Site + Admin + Banco de dados (SQLite)
1. Instale o Node.js (v18+). 2. Na pasta: `npm install`
3. Copie `.env.example` para `.env` e preencha (senha do admin e Gmail com "Senha de app").
4. `npm start` → Site: http://localhost:3000  | Admin: http://localhost:3000/admin.html
Banco: arquivo `castro.db` (tabelas veiculos, fotos, contatos). Fotos em `/uploads`. Faça backup dos dois.
Para colocar online use uma hospedagem com Node (Render, Railway, VPS) com disco persistente.
