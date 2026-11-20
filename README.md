# RedMaestra v6.0 — Portal Web

Portal web oficial de **RedMaestra**, plataforma de servicios profesionales con geolocalización en vivo, autenticación con **Auth0** (Google, Meta y correo) y sincronización con el Backend NoSQL.

## Requisitos
- **Node.js** 18+

## Ejecución Local
```bash
npm install
npm start
```
El portal quedará disponible en `http://localhost:8080`.

## Despliegue en Render
1. Conecta este repositorio (`https://github.com/EmhDev/red-maestra-front.git`) en **Render → New Web Service**.
2. **Build Command:** `npm install`
3. **Start Command:** `npm start`
4. En **Auth0 → Applications → profesearch → URLs**, agrega la URL pública de Render (ej. `https://red-maestra-front.onrender.com`) en *Allowed Callback URLs*, *Allowed Logout URLs* y *Allowed Web Origins*.
