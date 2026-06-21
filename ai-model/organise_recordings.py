"""
organise_recordings.py
Moves ASL training MP4s from Downloads into the correct
ai-model/data/asl_recordings/ subfolders.
"""

import shutil
from pathlib import Path

SOURCE      = Path("C:/Users/USER/Downloads")
DEST_BASE   = Path("C:/Users/USER/OneDrive/Desktop/echosign/ai-model/data/asl_recordings")

# Map: destination subfolder -> list of filename prefixes that belong there
CATEGORIES = {
    "greetings": [
        "hello", "my_name_is", "i_need_help", "thank_you",
        "yes", "no", "i_do_not_understand", "please_repeat",
        "i_am_finished",
    ],
    "card": [
        "card_not_working", "card_blocked", "card_stolen",
        "card_lost", "card_swallowed_atm", "card_online_fail",
        "card_pin_fail",
    ],
    "transfer": [
        "money_not_received", "wrong_person", "transfer_failed",
        "money_taken", "not_authorised", "wrong_balance",
        "dispute_transaction",
    ],
    "account": [
        "cannot_login", "account_locked", "forgot_password",
        "account_suspended", "mobile_banking_fail",
        # variant prefixes used in actual recordings
        "account_cant_login", "account_forget_password",
        "account_mobile_banking",
    ],
    "fraud": [
        "money_stolen", "account_hacked", "i_was_scammed",
        "unauthorised", "report_fraud",
    ],
    "atm": [
        "atm_no_money", "atm_swallowed", "atm_not_working",
        "atm_charged",
    ],
    "numbers": [
        "number_0", "number_1", "number_2", "number_3",
        "number_4", "number_5", "number_6", "number_7",
        "number_8", "number_9", "hundred", "thousand", "million",
    ],
    "banking_words": [
        "word_bank", "word_account", "word_card",
        "word_transfer", "word_money", "word_payment",
        "word_receipt", "word_statement", "word_branch",
        "word_online_banking", "word_mobile_app",
        "word_how_much", "word_amount", "word_date",
    ],
    "status": [
        "complaint_status", "reference_number",
        "issue_resolved", "still_waiting", "not_fixed",
    ],
    "confirmation": [
        "that_correct", "that_not_correct",
        "send_confirmation", "i_agree", "i_disagree",
        "speak_manager", "escalate", "my_name_sign",
        "account_number_sign", "phone_number_sign",
    ],
}

# Build a flat prefix -> subfolder lookup (longest-prefix wins)
PREFIX_MAP: dict[str, str] = {}
for folder, prefixes in CATEGORIES.items():
    for p in prefixes:
        PREFIX_MAP[p] = folder

def categorise(filename: str) -> str | None:
    """Return the destination subfolder name, or None if unmatched."""
    name_lower = filename.lower()
    # Try longest matching prefix first so e.g. card_swallowed_atm
    # isn't accidentally matched by a shorter prefix.
    best = None
    best_len = 0
    for prefix, folder in PREFIX_MAP.items():
        if name_lower.startswith(prefix) and len(prefix) > best_len:
            best = folder
            best_len = len(prefix)
    return best

def main() -> None:
    # 1. Create all destination subfolders
    for folder in CATEGORIES:
        (DEST_BASE / folder).mkdir(parents=True, exist_ok=True)

    # 2. Collect all .mp4 files in Downloads (non-recursive)
    mp4_files = sorted(SOURCE.glob("*.mp4"))
    if not mp4_files:
        print("No .mp4 files found in", SOURCE)
        return

    counts: dict[str, int] = {folder: 0 for folder in CATEGORIES}
    unmatched: list[str] = []
    total = 0

    # 3-5. Match and move each file
    for src in mp4_files:
        folder = categorise(src.name)
        if folder is None:
            print(f"WARNING: could not categorise {src.name}")
            unmatched.append(src.name)
            continue

        dest = DEST_BASE / folder / src.name
        # Avoid overwriting — append _dup if destination already exists
        if dest.exists():
            dest = dest.with_stem(dest.stem + "_dup")

        shutil.move(str(src), str(dest))
        print(f"Moved {src.name} -> {folder}/")
        counts[folder] += 1
        total += 1

    # 6. Summary
    print()
    print(f"Moved {total} files total")
    for folder, n in counts.items():
        if n:
            print(f"  {folder}/: {n} files")

    # 7. Unmatched warnings summary
    if unmatched:
        print()
        print(f"{len(unmatched)} file(s) could not be categorised:")
        for name in unmatched:
            print(f"  {name}")

if __name__ == "__main__":
    main()
