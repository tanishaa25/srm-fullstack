const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serve frontend

// ── YOUR DETAILS ──────────────────────────────────────────
const USER_ID = "yourname_ddmmyyyy";        // e.g. "rahulkumar_15032004"
const EMAIL_ID = "your@email.com";          // college email
const ROLL_NUMBER = "RA2211003010001";       // your roll number
// ─────────────────────────────────────────────────────────

// Validate one entry: must be X->Y, single uppercase letters, not self-loop
function isValid(entry) {
  return /^[A-Z]->[A-Z]$/.test(entry);
}

// Build trees and detect cycles from valid edges
function buildHierarchies(edges) {
  // Track children and parents
  const children = {};  // parent -> [children]
  const parents = {};   // child -> parent (first parent wins)

  for (const edge of edges) {
    const [parent, child] = edge.split('->');
    if (!children[parent]) children[parent] = [];
    // Diamond rule: first parent edge wins
    if (parents[child] === undefined) {
      parents[child] = parent;
      children[parent].push(child);
    }
    // Ensure parent node exists in children map
    if (!children[child]) children[child] = [];
  }

  // All nodes
  const allNodes = new Set([...Object.keys(children), ...Object.keys(parents)]);

  // Find roots: nodes that are never a child
  const roots = [...allNodes].filter(n => parents[n] === undefined);

  // Group nodes into connected components
  function getComponent(start) {
    const visited = new Set();
    const queue = [start];
    while (queue.length) {
      const node = queue.shift();
      if (visited.has(node)) continue;
      visited.add(node);
      (children[node] || []).forEach(c => queue.push(c));
      // also walk up
      if (parents[node]) queue.push(parents[node]);
    }
    return visited;
  }

  const assigned = new Set();
  const components = [];

  // Assign each root its component
  for (const root of roots.sort()) {
    if (assigned.has(root)) continue;
    const comp = getComponent(root);
    comp.forEach(n => assigned.add(n));
    components.push({ root, nodes: comp });
  }

  // Nodes with no root (pure cycles)
  const unassigned = [...allNodes].filter(n => !assigned.has(n));
  if (unassigned.length) {
    // Group them by connectivity
    while (unassigned.length) {
      const start = unassigned.sort()[0];
      const comp = getComponent(start);
      // lexicographically smallest node as root
      const root = [...comp].sort()[0];
      comp.forEach(n => {
        const idx = unassigned.indexOf(n);
        if (idx !== -1) unassigned.splice(idx, 1);
        assigned.add(n);
      });
      components.push({ root, nodes: comp });
    }
  }

  // Detect cycle in a component using DFS
  function hasCycle(root, comp) {
    const visited = new Set();
    const stack = new Set();
    function dfs(node) {
      visited.add(node);
      stack.add(node);
      for (const child of (children[node] || [])) {
        if (!comp.has(child)) continue;
        if (!visited.has(child)) {
          if (dfs(child)) return true;
        } else if (stack.has(child)) {
          return true;
        }
      }
      stack.delete(node);
      return false;
    }
    return dfs(root);
  }

  // Build nested tree object recursively
  function buildTree(node, visited = new Set()) {
    if (visited.has(node)) return {};
    visited.add(node);
    const obj = {};
    for (const child of (children[node] || [])) {
      obj[child] = buildTree(child, visited);
    }
    return obj;
  }

  // Calculate depth (longest root-to-leaf path, counting nodes)
  function calcDepth(node, visited = new Set()) {
    if (visited.has(node)) return 0;
    visited.add(node);
    let max = 0;
    for (const child of (children[node] || [])) {
      max = Math.max(max, calcDepth(child, new Set(visited)));
    }
    return 1 + max;
  }

  const hierarchies = [];

  for (const { root, nodes } of components) {
    const comp = new Set(nodes);
    if (hasCycle(root, comp)) {
      hierarchies.push({ root, tree: {}, has_cycle: true });
    } else {
      const tree = { [root]: buildTree(root) };
      const depth = calcDepth(root);
      hierarchies.push({ root, tree, depth });
    }
  }

  return hierarchies;
}

app.post('/bfhl', (req, res) => {
  const raw = req.body.data || [];

  const invalid_entries = [];
  const duplicate_edges = [];
  const seen = new Set();
  const validEdges = [];

  for (let entry of raw) {
    entry = entry.trim(); // trim whitespace first

    if (!isValid(entry)) {
      invalid_entries.push(entry);
      continue;
    }

    // Self-loop already caught by regex (A->A fails [A-Z]->[A-Z] since same letter... 
    // Actually regex allows it, so check explicitly:
    const [p, c] = entry.split('->');
    if (p === c) { invalid_entries.push(entry); continue; }

    if (seen.has(entry)) {
      if (!duplicate_edges.includes(entry)) duplicate_edges.push(entry);
    } else {
      seen.add(entry);
      validEdges.push(entry);
    }
  }

  const hierarchies = buildHierarchies(validEdges);

  // Summary
  const nonCyclic = hierarchies.filter(h => !h.has_cycle);
  const cyclic = hierarchies.filter(h => h.has_cycle);

  let largest_tree_root = '';
  if (nonCyclic.length) {
    const sorted = nonCyclic.sort((a, b) => {
      if (b.depth !== a.depth) return b.depth - a.depth;
      return a.root.localeCompare(b.root); // tiebreak: lex smaller
    });
    largest_tree_root = sorted[0].root;
  }

  res.json({
    user_id: USER_ID,
    email_id: EMAIL_ID,
    college_roll_number: ROLL_NUMBER,
    hierarchies,
    invalid_entries,
    duplicate_edges,
    summary: {
      total_trees: nonCyclic.length,
      total_cycles: cyclic.length,
      largest_tree_root,
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));