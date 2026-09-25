#!/bin/bash
# scripts/run-all-tests.sh
# Ejecuta todos los tests de forma secuencial y muestra un resumen detallado.

set +e

BACKEND=0
FRONTEND=0
ORCH=0
INTEGRATION=0

# --- Helper: strip ANSI escape codes ---
strip_ansi() {
    echo "$1" | sed 's/\x1b\[[0-9;]*m//g'
}

echo "=========================================="
echo "  Ejecutando todos los tests..."
echo "=========================================="

echo ""
echo "--- Backend tests ---"
BACKEND_OUT=$(strip_ansi "$(npm run test:back 2>&1)") || BACKEND=$?

echo ""
echo "--- Frontend tests ---"
FRONTEND_OUT=$(strip_ansi "$(npm run test:front 2>&1)") || FRONTEND=$?

echo ""
echo "--- Orchestration tests ---"
ORCH_OUT=$(strip_ansi "$(npm run test:orch 2>&1)") || ORCH=$?

echo ""
echo "--- Integration tests ---"
INTEGRATION_OUT=$(strip_ansi "$(npm run test:integration 2>&1)") || INTEGRATION=$?

# --- Parse vitest output: "Tests  N passed (M)" + "Duration  X.XXs ..." ---
parse_vitest() {
    local output="$1"
    local passed failed duration
    passed=$(echo "$output" | grep -oP 'Tests\s+\K\d+(?=\s+passed)' | head -1)
    failed=$(echo "$output" | grep -oP 'Tests\s+\K\d+(?=\s+failed)' | head -1)
    duration=$(echo "$output" | grep -oP 'Duration\s+\K[\d.]+s' | head -1)
    echo "${passed:-0} ${failed:-0} ${duration:-0s}"
}

# --- Parse pytest output: "N passed in X.XXs" (may have leading === chars) ---
parse_pytest() {
    local output="$1"
    local passed failed duration
    passed=$(echo "$output" | grep -oP '\d+\s+passed' | grep -oP '^\d+' | head -1)
    failed=$(echo "$output" | grep -oP '\d+\s+failed' | grep -oP '^\d+' | head -1)
    duration=$(echo "$output" | grep -oP 'in\s+\K[\d.]+s' | head -1)
    echo "${passed:-0} ${failed:-0} ${duration:-0s}"
}

read -r B_PASSED B_FAILED B_DURATION <<< "$(parse_vitest "$BACKEND_OUT")"
read -r F_PASSED F_FAILED F_DURATION <<< "$(parse_vitest "$FRONTEND_OUT")"
read -r O_PASSED O_FAILED O_DURATION <<< "$(parse_pytest "$ORCH_OUT")"
read -r I_PASSED I_FAILED I_DURATION <<< "$(parse_vitest "$INTEGRATION_OUT")"

TOTAL=$((B_PASSED + F_PASSED + O_PASSED + I_PASSED))
TOTAL_FAILED=$((B_FAILED + F_FAILED + O_FAILED + I_FAILED))

fmt_result() {
    local status=$1 passed=$2 failed=$3 duration=$4
    if [ "$status" -eq 0 ]; then
        echo "OK (${passed}/${passed} tests, ${duration})"
    else
        echo "FAIL (${passed} passed, ${failed} failed, ${duration})"
    fi
}

echo ""
echo "=========================================="
echo "  Resumen de tests"
echo "=========================================="
echo "  Backend:       $(fmt_result $BACKEND $B_PASSED $B_FAILED $B_DURATION)"
echo "  Frontend:      $(fmt_result $FRONTEND $F_PASSED $F_FAILED $F_DURATION)"
echo "  Orchestration: $(fmt_result $ORCH $O_PASSED $O_FAILED $O_DURATION)"
echo "  Integration:   $(fmt_result $INTEGRATION $I_PASSED $I_FAILED $I_DURATION)"
echo "=========================================="
echo "  Total: ${TOTAL} tests passed${TOTAL_FAILED:+ ($TOTAL_FAILED failed)}"
echo "=========================================="

if [ $BACKEND -eq 0 ] && [ $FRONTEND -eq 0 ] && [ $ORCH -eq 0 ] && [ $INTEGRATION -eq 0 ]; then
    echo "Todos los tests pasaron"
    exit 0
else
    echo "Algunos tests fallaron"
    exit 1
fi
