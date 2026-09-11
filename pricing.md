Update the existing APÉRO BUY TICKET section to improve the ticket comparison and selection experience.

IMPORTANT:
This is NOT a redesign.
Preserve the existing APÉRO visual identity, typography, colors, animations, card style, and overall premium aesthetic.
Only modify the BUY TICKET / ticket-plan section described below.

==================================================
1. TWO MAIN CATEGORIES
==================================================

Create two clearly labeled ticket categories:

SINGLE ENTRY

GROUP ENTRY

These should be visually distinct but part of the same ticket-selection experience.

==================================================
2. HORIZONTAL SCROLLING TICKET CARDS
==================================================

The ticket cards within the ticket-selection section should be arranged horizontally so users can swipe/scroll through them.

The goal is to let users directly compare:

SINGLE ENTRY PRICE/PERSON
vs
GROUP ENTRY PRICE/PERSON

Use a smooth horizontal scrolling layout.

IMPORTANT:
- Especially optimize this for mobile.
- Users should be able to swipe left/right naturally.
- Do NOT force all cards into a narrow grid.
- Do NOT shrink cards excessively to fit the screen.
- Cards should retain comfortable readable widths.
- Avoid horizontal page overflow; ONLY the ticket-card container should horizontally scroll.
- Hide unnecessary scrollbar visuals while retaining scrolling functionality where appropriate.
- Do not require arrow buttons to use the carousel on mobile.

Example structure:

SINGLE ENTRY
[ Super Early Bird ] [ Early Bird ] [ Stage 1 ] [ Stage 2 ] →

GROUP ENTRY
[ Group of 5 ] [ Group of 8 ] →

OR, preferably, create one horizontally scrollable comparison track containing the available plans while maintaining clear labels for SINGLE ENTRY and GROUP ENTRY.

Choose the structure that provides the clearest price comparison without making the UI confusing.

==================================================
3. SINGLE ENTRY PLANS
==================================================

Display these individual ticket plans:

SUPER EARLY BIRD
₹1,111 / PERSON
Status/visual treatment: DIMMED

EARLY BIRD
₹1,333 / PERSON
Status/visual treatment: IN FOCUS / FEATURED

STAGE 1
₹1,777 / PERSON
Status: NORMAL

STAGE 2
PRICE: TBD
Status: COMING SOON / TBD

Do NOT invent the Stage 2 price.

==================================================
4. GROUP ENTRY PLANS
==================================================

GROUP OF 5

Total price:
₹6,000

Clearly display:

₹1,200 / PERSON

The comparison should make it immediately obvious that:

5 PEOPLE
₹6,000 TOTAL
₹1,200 / PERSON

GROUP OF 8

Total price:
₹9,200

Clearly calculate/display:

₹1,150 / PERSON

The card should show:

8 PEOPLE
₹9,200 TOTAL
₹1,150 / PERSON

Make sure the calculation is correct:

₹9,200 ÷ 8 = ₹1,150/person

==================================================
5. DIRECT PRICE COMPARISON
==================================================

The primary purpose of this UI is to help users quickly compare individual vs group pricing.

Make the per-person amount visually prominent.

For example:

SINGLE ENTRY

EARLY BIRD
₹1,333
PER PERSON

GROUP ENTRY

GROUP OF 5
₹6,000
₹1,200 / PERSON

GROUP OF 8
₹9,200
₹1,150 / PERSON

The user should immediately understand that group plans offer a lower effective price per person.

Do NOT make this comparison complicated.

==================================================
6. HORIZONTAL SWIPE UX
==================================================

For mobile:

- Cards should be horizontally scrollable using touch/swipe.
- Keep enough of the next card visible at the edge of the screen to indicate that more cards are available.
- Add subtle visual affordance such as partial card visibility rather than intrusive arrows.
- Use scroll-snap where appropriate so cards settle naturally after swiping.
- Maintain comfortable spacing between cards.
- Prevent accidental vertical page scrolling from being trapped inside the carousel.
- Ensure the page itself still scrolls vertically normally.

Example CSS behavior:

overflow-x: auto;
scroll-snap-type: x mandatory;

with each card using an appropriate:

scroll-snap-align

Adapt this to the project's existing styling system.

==================================================
7. DESKTOP BEHAVIOR
==================================================

Desktop should remain clean and premium.

Do not unnecessarily introduce a mobile-style carousel onto desktop.

On larger screens:
- Cards can be displayed in a row/grid if that matches the current approved design.
- Horizontal scrolling may be used only when necessary.
- Preserve the existing desktop layout as much as possible.

The horizontal swipe interaction is primarily intended for mobile.

==================================================
8. CARD CONTENT
==================================================

Every available ticket card should clearly show:

PLAN NAME
TOTAL PRICE
PRICE PER PERSON
NUMBER OF PEOPLE (for group plans)
STATUS
SELECT / BUY TICKET

Examples:

SUPER EARLY BIRD
₹1,111
₹1,111 / PERSON

EARLY BIRD
₹1,333
₹1,333 / PERSON

STAGE 1
₹1,777
₹1,777 / PERSON

GROUP OF 5
₹6,000
₹1,200 / PERSON
5 PEOPLE

GROUP OF 8
₹9,200
₹1,150 / PERSON
8 PEOPLE

==================================================
9. FEATURED PLAN
==================================================

EARLY BIRD ₹1,333 should remain the main visually focused individual ticket.

Do NOT make group tickets look inferior.
Both group options should still feel premium and attractive.

The user should be able to compare them without confusion.

==================================================
10. SELECTION
==================================================

All available ticket plans must remain selectable.

When the user selects a ticket:

- Clearly indicate the selected card.
- Pass the selected plan into the existing booking flow.
- Preserve the existing BUY TICKET/checkout behavior.
- Do not create separate checkout implementations for every plan.

For TBD/COMING SOON plans:

- Do not allow normal checkout unless the existing business logic specifically supports it.
- Clearly communicate that the plan is not currently available.

==================================================
11. RESPONSIVE REQUIREMENTS
==================================================

Test especially on:

375px
390px
393px
412px
430px

The ticket comparison must:

- Never cause unwanted page-level horizontal scrolling.
- Keep card text readable.
- Keep prices prominent.
- Keep buttons easy to tap.
- Allow smooth horizontal swiping.
- Work correctly on Safari iOS and Chrome Android.

==================================================
12. FINAL TICKET DATA
==================================================

Use exactly these prices:

SINGLE ENTRY:

SUPER EARLY BIRD → ₹1,111/person
EARLY BIRD → ₹1,333/person
STAGE 1 → ₹1,777/person
STAGE 2 → TBD

GROUP ENTRY:

GROUP OF 5 → ₹6,000 total → ₹1,200/person
GROUP OF 8 → ₹9,200 total → ₹1,150/person

Do NOT modify these prices.

==================================================
13. FINAL CHECK
==================================================

Before finishing, verify:

- Single Entry and Group Entry are clearly separated/labeled.
- Ticket cards can be horizontally swiped on mobile.
- Users can directly compare per-person pricing.
- Group of 5 shows ₹6,000 total and ₹1,200/person.
- Group of 8 shows ₹9,200 total and ₹1,150/person.
- Super Early Bird ₹1,111 is visually dimmed.
- Early Bird ₹1,333 remains featured/in focus.
- Stage 1 is ₹1,777.
- Stage 2 remains TBD.
- No fake pricing is shown.
- No page-level horizontal overflow exists.
- Mobile scrolling feels natural.
- Existing booking/selection logic continues to work.
- Desktop remains essentially unchanged.
- No unrelated sections are modified.
- No console errors are introduced.

Make ONLY these BUY TICKET / ticket comparison changes.