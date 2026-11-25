export const seedGraph = {
  nodes: [
    { id: "delaware", name: "Delaware Basin", kind: "receipt", x: 83, y: 130 },
    { id: "waha", name: "Waha", kind: "interconnect", x: 243, y: 130 },
    { id: "agua-dulce", name: "Agua Dulce", kind: "interconnect", x: 450, y: 218 },
    { id: "storage", name: "Katy-area storage", kind: "storage", x: 470, y: 46 },
    { id: "katy", name: "Katy", kind: "delivery", x: 700, y: 66 },
    { id: "hsc", name: "Houston Ship Channel", kind: "delivery", x: 700, y: 218 },
  ],
  edges: [
    { id: "del-waha", from: "delaware", to: "waha", board: "CG", name: "Delaware gathering", tariff: 0.12, fuel: 0.008, capacity: 100000 },
    { id: "php-katy", from: "waha", to: "katy", board: "PHP", name: "Permian Highway route", tariff: 0.35, fuel: 0.015, capacity: 65000 },
    { id: "gcx-agua", from: "waha", to: "agua-dulce", board: "GCX", name: "Gulf Coast Express route", tariff: 0.28, fuel: 0.018, capacity: 85000 },
    { id: "agua-hsc", from: "agua-dulce", to: "hsc", board: null, name: "South Texas connector", tariff: 0.24, fuel: 0.01, capacity: 40000 },
    { id: "katy-hsc", from: "katy", to: "hsc", board: null, name: "Katy–Houston connector", tariff: 0.12, fuel: 0.005, capacity: 25000 },
    { id: "waha-storage", from: "waha", to: "storage", board: "PHP", name: "Storage access scenario", tariff: 0.40, fuel: 0.02, capacity: 22000 },
    { id: "storage-katy", from: "storage", to: "katy", board: null, name: "Storage delivery scenario", tariff: 0.16, fuel: 0.01, capacity: 17000 },
  ].map((edge) => ({ ...edge, capacitySource: "illustrative" })),
};

export function validateGraph(graph) {
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.size !== graph.nodes.length || new Set(graph.edges.map((edge) => edge.id)).size !== graph.edges.length) {
    throw new Error("Duplicate graph IDs");
  }
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || !Number.isFinite(edge.tariff) || edge.tariff < 0 ||
      !Number.isFinite(edge.fuel) || edge.fuel < 0 || edge.fuel >= 1 ||
      !Number.isFinite(edge.capacity) || edge.capacity < 0) {
      throw new Error(`Invalid corridor segment: ${edge.id}`);
    }
  }
  return graph;
}

export function withCapacity(graph, rows) {
  return {
    ...graph,
    edges: graph.edges.map((edge) => {
      const row = rows?.find(({ edgeId }) => edgeId === edge.id);
      return row ? {
        ...edge, capacity: row.oac, capacitySource: "reported", capacityAsOf: row.asOf,
        scheduledVolume: row.scheduledVolume ?? null, capacityUrl: row.sourceUrl,
      } : edge;
    }),
  };
}

export function memoryGraph(graph = seedGraph) {
  validateGraph(graph);
  return { name: "In-memory", async read() { return structuredClone(graph); } };
}
