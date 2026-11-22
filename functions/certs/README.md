# Carpeta Segura de Certificados Locales (Ignorada por Git y Firebase)

Coloca aquí tus certificados digitales locales cuando estén disponibles — **nunca** serán subidos a Git ni al paquete de código de Firebase (están bloqueados en `.gitignore` y `firebase.json`):

- **Certificado Digital DGII (INDOTEL / Viafirma / Cámara):** `functions/certs/dgii.p12`
- **Certificado mTLS Azul (Banco Popular):** `functions/certs/azul.crt` (o `azul.pem`) y `functions/certs/azul.key`

Una vez colocados aquí, simplemente ejecuta desde la raíz del proyecto:

```bash
npm run env:sync-certs
npm run env:check
```

El script codificará los archivos en Base64 (1 sola línea), los escribirá automáticamente en `functions/.env` y validará criptográficamente la contraseña y vigencia del `.p12`.
