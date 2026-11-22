#!/usr/bin/env bash
# ==============================================================================
# Green Mile Construction RD — Configurador y Despliegue Seguro de Credenciales
# ==============================================================================
# Uso:
#   ./scripts/configure-secrets.sh                    # Inicializa functions/.env y valida variables
#   ./scripts/configure-secrets.sh --init             # Crea functions/.env (chmod 600) + secretos aleatorios
#   ./scripts/configure-secrets.sh --wizard           # Asistente interactivo paso a paso para llenar functions/.env
#   ./scripts/configure-secrets.sh --sync-certs       # Codifica functions/certs/*.p12|.crt|.key -> Base64 en functions/.env
#   ./scripts/configure-secrets.sh --check            # Valida variables + prueba criptográfica .p12/PEM sin imprimir secretos
#   ./scripts/configure-secrets.sh --encode-cert RUTA # Convierte .p12/.pem/.key a Base64 (1 línea)
#   ./scripts/configure-secrets.sh --deploy           # Sincroniza certs, valida, prueba y despliega a Firebase
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIREBASE_PROJECT="${FIREBASE_PROJECT_ID:-studio-8139121026-17b90}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

encode_cert() {
  local cert_path="${1:-}"
  if [[ -z "$cert_path" || ! -f "$cert_path" ]]; then
    log_error "Archivo de certificado no encontrado: '$cert_path'"
    exit 1
  fi
  log_info "Codificando '$(basename "$cert_path")' a Base64 en una sola línea (copia el resultado en functions/.env):"
  echo ""
  base64 -w 0 "$cert_path" 2>/dev/null || base64 "$cert_path" | tr -d '\n'
  echo ""
  echo ""
  log_ok "Listo. Recuerda NO subir el archivo original ni functions/.env a Git."
}

deploy_all() {
  log_info "Sincronizando certificados locales (si existen en functions/certs/ o *_PATH)..."
  node "$ROOT_DIR/scripts/setup-env.mjs" sync-certs

  log_info "Validando functions/.env y verificando certificados criptográficamente..."
  node "$ROOT_DIR/scripts/setup-env.mjs" check

  log_info "Instalando dependencias de Cloud Functions..."
  npm --prefix "$ROOT_DIR/functions" install --no-audit --no-fund

  log_info "Ejecutando pruebas de humo aisladas (pagos, firma XMLDSig .p12, QR DGII y webhooks)..."
  npm --prefix "$ROOT_DIR" run functions:test

  log_info "Verificando que functions/.env esté ignorado por Git..."
  if git -C "$ROOT_DIR" check-ignore -q functions/.env; then
    log_ok "functions/.env está protegido por .gitignore"
  else
    log_error "¡PELIGRO! functions/.env NO está en .gitignore. Deteniendo despliegue."
    exit 1
  fi

  log_info "Regenerando páginas del catálogo..."
  npm --prefix "$ROOT_DIR" run build:pages

  local sa_file="$ROOT_DIR/functions/certs/firebase-adminsdk.json"
  if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" && -f "$sa_file" ]]; then
    export GOOGLE_APPLICATION_CREDENTIALS="$sa_file"
    log_info "Usando cuenta de servicio local ($sa_file) para autenticación Firebase..."
  fi

  log_info "Publicando firestore.rules en producción vía Firebase Admin SDK..."
  node "$ROOT_DIR/scripts/deploy-firestore-rules.mjs"

  log_info "Desplegando Cloud Functions v2 (inyectando variables desde functions/.env) y Hosting al proyecto $FIREBASE_PROJECT..."
  (cd "$ROOT_DIR" && npx --yes firebase-tools deploy --only functions,hosting --project "$FIREBASE_PROJECT" --non-interactive --force)

  echo ""
  log_ok "Despliegue completado. Verifica el estado en vivo en:"
  echo "  https://us-central1-${FIREBASE_PROJECT}.cloudfunctions.net/api/health"
  echo "  y desde el Centro Administrativo (Configuración Empresa -> Probar Conexión Backend)."
}

case "${1:-}" in
  --init)
    node "$ROOT_DIR/scripts/setup-env.mjs" init
    ;;
  --wizard|--interactive)
    node "$ROOT_DIR/scripts/setup-env.mjs" wizard
    ;;
  --sync-certs)
    node "$ROOT_DIR/scripts/setup-env.mjs" sync-certs
    ;;
  --encode-cert)
    encode_cert "${2:-}"
    ;;
  --check)
    node "$ROOT_DIR/scripts/setup-env.mjs" check
    ;;
  --deploy)
    deploy_all
    ;;
  -h|--help)
    sed -n '2,13p' "$0"
    ;;
  *)
    node "$ROOT_DIR/scripts/setup-env.mjs" init
    node "$ROOT_DIR/scripts/setup-env.mjs" check
    ;;
esac
