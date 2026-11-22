#!/usr/bin/env bash
# ==============================================================================
# Green Mile Construction RD — Configurador y Despliegue Seguro de Credenciales
# ==============================================================================
# Uso:
#   ./scripts/configure-secrets.sh                    # Inicializa functions/.env y valida variables
#   ./scripts/configure-secrets.sh --check            # Valida variables sin imprimir secretos
#   ./scripts/configure-secrets.sh --encode-cert RUTA # Convierte .p12/.pem/.key a Base64 (1 línea)
#   ./scripts/configure-secrets.sh --deploy           # Valida, corre pruebas y despliega a Firebase
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/functions/.env"
EXAMPLE_FILE="$ROOT_DIR/functions/.env.example"
FIREBASE_PROJECT="${FIREBASE_PROJECT_ID:-studio-8139121026-17b90}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
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

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$EXAMPLE_FILE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log_warn "Se creó $ENV_FILE desde .env.example (permisos 600)."
    log_info "Edita functions/.env con tus API keys reales y vuelve a ejecutar este script."
  fi
}

read_env_var() {
  local key="$1"
  local val=""
  if [[ -f "$ENV_FILE" ]]; then
    val=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d '=' -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' || true)
  fi
  echo "$val"
}

check_required() {
  local missing=0
  for key in "$@"; do
    local val
    val="$(read_env_var "$key")"
    if [[ -z "$val" ]]; then
      log_error "  Falta configurar: $key"
      missing=1
    else
      log_ok "  $key cargado (longitud: ${#val} caracteres)"
    fi
  done
  return $missing
}

validate_env() {
  ensure_env_file
  local has_error=0

  echo ""
  log_info "=== Validación de Configuración Green Mile RD (sin exponer secretos) ==="

  local pay_provider
  pay_provider="$(read_env_var PAYMENT_PROVIDER)"
  pay_provider="${pay_provider:-sandbox}"
  log_info "Pasarela de Tarjetas configurada: $pay_provider"

  case "$pay_provider" in
    azul)
      check_required AZUL_AUTH1 AZUL_AUTH2 AZUL_STORE_ID AZUL_CERT_BASE64 AZUL_KEY_BASE64 || has_error=1
      ;;
    cardnet)
      check_required CARDNET_MERCHANT_ID CARDNET_TERMINAL_ID CARDNET_PRIVATE_KEY || has_error=1
      ;;
    visanet)
      check_required VISANET_MERCHANT_ID VISANET_API_KEY_ID VISANET_API_SECRET || has_error=1
      ;;
    stripe)
      check_required STRIPE_SECRET_KEY || has_error=1
      ;;
    sandbox)
      log_warn "  Modo SANDBOX activo para tarjetas (ideal para QA antes de activar llaves bancarias)."
      ;;
    *)
      log_error "  PAYMENT_PROVIDER desconocido: '$pay_provider' (usa: azul | cardnet | visanet | stripe | sandbox)"
      has_error=1
      ;;
  esac

  echo ""
  local dgii_mode
  dgii_mode="$(read_env_var DGII_ECF_MODE)"
  dgii_mode="${dgii_mode:-sandbox}"
  local dgii_env
  dgii_env="$(read_env_var DGII_ENV)"
  dgii_env="${dgii_env:-testecf}"
  log_info "Facturación DGII e-CF configurada: $dgii_mode (ambiente: $dgii_env)"

  case "$dgii_mode" in
    direct_dgii)
      check_required DGII_EMISOR_RNC DGII_CERT_P12_BASE64 DGII_CERT_PASSWORD || has_error=1
      ;;
    provider_api)
      check_required DGII_EMISOR_RNC ECF_PROVIDER_BASE_URL ECF_PROVIDER_API_KEY || has_error=1
      ;;
    sandbox)
      log_warn "  Modo SANDBOX activo para DGII e-CF (genera XML v1.0 sin transmitir a DGII)."
      ;;
    *)
      log_error "  DGII_ECF_MODE desconocido: '$dgii_mode' (usa: direct_dgii | provider_api | sandbox)"
      has_error=1
      ;;
  esac

  echo ""
  local email_provider
  email_provider="$(read_env_var EMAIL_PROVIDER)"
  email_provider="${email_provider:-none}"
  log_info "Notificaciones de Correo: $email_provider"
  case "$email_provider" in
    resend)
      check_required RESEND_API_KEY EMAIL_FROM || has_error=1
      ;;
    smtp)
      check_required SMTP_HOST SMTP_USER SMTP_PASS EMAIL_FROM || has_error=1
      ;;
    none)
      log_warn "  Envío de correo desactivado (opcional: configura resend o smtp)."
      ;;
  esac

  local wa_token
  wa_token="$(read_env_var WHATSAPP_TOKEN)"
  if [[ -n "$wa_token" ]]; then
    log_info "Notificaciones WhatsApp Business Cloud:"
    check_required WHATSAPP_TOKEN WHATSAPP_PHONE_NUMBER_ID || has_error=1
  else
    log_warn "WhatsApp Business Cloud no configurado aún (opcional)."
  fi

  echo ""
  if [[ "$has_error" -ne 0 ]]; then
    log_error "Faltan variables requeridas en functions/.env para los proveedores seleccionados."
    return 1
  fi
  log_ok "Validación completada exitosamente."
  return 0
}

deploy_all() {
  validate_env

  log_info "Instalando dependencias de Cloud Functions..."
  npm --prefix "$ROOT_DIR/functions" install --no-audit --no-fund

  log_info "Ejecutando pruebas de humo (pagos, firma XMLDSig .p12, QR DGII y webhooks)..."
  npm --prefix "$ROOT_DIR" run functions:test

  log_info "Verificando que functions/.env esté ignorado por Git..."
  if git -C "$ROOT_DIR" check-ignore -q functions/.env; then
    log_ok "functions/.env está protegido por .gitignore"
  else
    log_error "¡PELIGRO! functions/.env NO está en .gitignore. Deteniendo despliegue."
    exit 1
  fi

  log_info "Desplegando Cloud Functions v2, Reglas Firestore y Firebase Hosting al proyecto $FIREBASE_PROJECT..."
  (cd "$ROOT_DIR" && npx --yes firebase-tools deploy --only functions,firestore:rules,hosting --project "$FIREBASE_PROJECT")

  echo ""
  log_ok "Despliegue completado. Verifica el estado en vivo en:"
  echo "  https://us-central1-${FIREBASE_PROJECT}.cloudfunctions.net/api/health"
  echo "  y desde el Centro Administrativo (Configuración Empresa -> Probar Conexión Backend)."
}

case "${1:-}" in
  --encode-cert)
    encode_cert "${2:-}"
    ;;
  --check)
    validate_env
    ;;
  --deploy)
    deploy_all
    ;;
  -h|--help)
    sed -n '2,11p' "$0"
    ;;
  *)
    validate_env
    echo ""
    log_info "Cuando hayas completado tus API keys en functions/.env, ejecuta:"
    echo "  ./scripts/configure-secrets.sh --deploy"
    ;;
esac
