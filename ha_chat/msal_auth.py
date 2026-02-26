"""
Microsoft Graph / OneNote – Authentifizierung per MSAL (Microsoft Authentication Library).
Device Flow + Token-Cache, kein client_secret nötig (öffentlicher Client).
"""
import json
import logging
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

SCOPES = ["Notes.Read", "User.Read"]


def get_access_token_msal(
    tenant: str,
    client_id: str,
    cache_path: str,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Holt ein Access Token per MSAL (Device Flow oder Cache).
    Kein client_secret nötig – in Azure „Öffentliche Clientflows zulassen“ = Ja setzen.

    Returns:
        (access_token, refresh_token) – refresh_token nur für Abwärtskompatibilität (kann None sein).
    """
    import msal

    client_id = (client_id or "").strip()
    if not client_id:
        logger.warning("MSAL: client_id fehlt")
        return (None, None)

    authority = f"https://login.microsoftonline.com/{tenant.strip() or 'common'}"

    # Token-Cache persistent laden/speichern
    cache = msal.SerializableTokenCache()
    path = Path(cache_path)
    if path.exists():
        try:
            cache.deserialize(path.read_text())
        except Exception as e:
            logger.warning("MSAL: Cache konnte nicht geladen werden: %s", e)

    app = msal.PublicClientApplication(
        client_id=client_id,
        authority=authority,
        token_cache=cache,
    )

    # 1) Zuerst still aus Cache
    accounts = app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(SCOPES, account=accounts[0])
        if result and result.get("access_token"):
            if path:
                try:
                    path.write_text(cache.serialize())
                except Exception as e:
                    logger.warning("MSAL: Cache konnte nicht gespeichert werden: %s", e)
            return (result["access_token"], result.get("refresh_token"))

    # 2) Device Flow
    flow = app.initiate_device_flow(scopes=SCOPES)
    if "user_code" not in flow:
        logger.warning("MSAL: Device Flow konnte nicht gestartet werden: %s", flow.get("error_description", flow))
        return (None, None)

    message = flow.get("message", "")
    user_code = flow.get("user_code", "")
    verification_uri = flow.get("verification_uri") or "https://login.microsoft.com/device"

    print("\n" + "=" * 60)
    print("  HA Chat – OneNote-Anmeldung (Microsoft MSAL)")
    print("=" * 60)
    print("  Öffne im Browser:  " + verification_uri)
    print("  Gib folgenden Code ein:  " + user_code)
    print("  (Gültig ca. 15 Min. – Warte auf deine Anmeldung …)")
    print("=" * 60 + "\n")
    logger.info("MSAL Device Flow: Öffne %s und gib ein: %s", verification_uri, user_code)

    result = app.acquire_token_by_device_flow(flow)
    if not result:
        logger.warning("MSAL: acquire_token_by_device_flow lieferte kein Ergebnis")
        return (None, None)
    if "access_token" not in result:
        err = result.get("error_description") or result.get("error", "unknown")
        logger.warning("MSAL: Token-Abruf fehlgeschlagen: %s", err)
        return (None, None)

    # Cache speichern
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(cache.serialize())
    except Exception as e:
        logger.warning("MSAL: Cache konnte nicht gespeichert werden: %s", e)

    print("  OneNote-Anmeldung erfolgreich.\n")
    logger.info("MSAL: Anmeldung erfolgreich")
    return (result["access_token"], result.get("refresh_token"))
