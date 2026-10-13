# Everyday formatting

Results that read at a glance: dates in your format, numbers with separators, money with its currency, NULLs you cannot miss, and the values that matter coloured.

## What is in it

**Dates and times**

- **Date format**: every date and timestamp in the format you pick: ISO, European, US, long, short, with the weekday, and more.
- **Time ago**: a timestamp named `*_at` reads as "3 hours ago", the exact time on hover.

**Numbers and money**

- **Numbers**: thousands separators, a fixed number of decimals, negatives in red or in parentheses.
- **Currency**: amounts as money, in the currency and the style you choose.

**Values at a glance**

- **Nulls**: a NULL reads as a dimmed symbol and an empty string as (empty), so the two never look alike.
- **Booleans**: a green Yes or a red No.
- **Status**: a column named `*status` reads green, amber or red by its value.
- **Json**: JSON reads compact on one line, the indented value on hover.

**Calling out**

- **Highlight**: colours the cells that meet a condition you set: above, below, between, containing, empty.

## Where to start

These change how values read, so they are meant for every result.

1. On each one's page, choose **Everywhere** under **Applies to** (or **This workspace** for this workspace only).
2. Open **Date format**, **Numbers** and **Currency** once to pick your format; the others work as they are.
3. To try one on a single result first, right-click the result and choose **Extensions…**.

Copying, exporting and the console still give the values exactly as the server sent them. The pack's members are named in `everyday-formatting.plumesql-pack.json`; the pack's page lists them with where each one stands.
