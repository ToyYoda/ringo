// Seating assistant: assigns attending guests to tables respecting
// "together" rules (hard), "apart" rules (hard where possible) and keeping groups together.

/**
 * @param guests  [{ id, group_label, seats }]  seats = 1 + plus-one
 * @param tables  [{ id, capacity }]
 * @param rules   [{ guest_a, guest_b, kind }]
 * @returns { assignment: Map<guestId, tableId>, unplaced: guestId[], conflicts: string[] }
 */
export function autoSeat(guests, tables, rules) {
  // 1. Merge "together" rules into clusters (union-find).
  const parent = new Map(guests.map((g) => [g.id, g.id]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  for (const r of rules) {
    if (r.kind === 'together' && parent.has(r.guest_a) && parent.has(r.guest_b)) parent.set(find(r.guest_a), find(r.guest_b));
  }
  const clusters = new Map();
  for (const g of guests) {
    const root = find(g.id);
    if (!clusters.has(root)) clusters.set(root, { members: [], seats: 0, groups: new Map() });
    const c = clusters.get(root);
    c.members.push(g);
    c.seats += g.seats;
    if (g.group_label) c.groups.set(g.group_label, (c.groups.get(g.group_label) || 0) + 1);
  }
  const apart = rules.filter((r) => r.kind === 'apart');
  const clusterOf = (id) => find(id);

  // 2. Biggest clusters first; choose the table that keeps groups together without conflicts.
  const state = tables.map((t) => ({ id: t.id, free: t.capacity, guests: new Set(), groups: new Map() }));
  const assignment = new Map();
  const unplaced = [];
  const sorted = [...clusters.values()].sort((a, b) => b.seats - a.seats);

  for (const c of sorted) {
    const ids = new Set(c.members.map((m) => m.id));
    let best = null;
    let bestScore = -Infinity;
    for (const t of state) {
      if (t.free < c.seats) continue;
      const conflict = apart.some(
        (r) => (ids.has(r.guest_a) && t.guests.has(r.guest_b)) || (ids.has(r.guest_b) && t.guests.has(r.guest_a)),
      );
      if (conflict) continue;
      let score = 0;
      for (const [grp, n] of c.groups) score += (t.groups.get(grp) || 0) * n * 10;
      score -= Math.abs(t.free - c.seats) * 0.1; // mild preference for a snug fit
      if (t.guests.size === 0) score -= 1; // prefer filling started tables
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (!best) { unplaced.push(...c.members.map((m) => m.id)); continue; }
    for (const m of c.members) {
      assignment.set(m.id, best.id);
      best.guests.add(m.id);
      if (m.group_label) best.groups.set(m.group_label, (best.groups.get(m.group_label) || 0) + 1);
    }
    best.free -= c.seats;
  }

  const conflicts = [];
  for (const r of apart) {
    if (clusterOf(r.guest_a) === clusterOf(r.guest_b)) conflicts.push(`Regel widerspricht sich: ${r.guest_a} soll mit und getrennt von ${r.guest_b} sitzen.`);
  }
  return { assignment, unplaced, conflicts };
}
