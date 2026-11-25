export function solve(graph, input, notices = []) {
  const { origin, supplyPrice, demand, markets } = input ?? {};
  const node = graph.nodes.find(({ id }) => id === origin);
  const destinations = graph.nodes.filter(({ kind }) => kind === "delivery");
  if (!node || !["receipt", "interconnect"].includes(node.kind) || !Number.isFinite(supplyPrice) ||
    !Number.isFinite(demand) || demand <= 0 || !markets ||
    destinations.some(({ id }) => !Number.isFinite(markets[id]))) {
    throw new RangeError("Enter an origin, finite prices for supply and every delivery, and a positive delivered volume.");
  }

  const routes = [];
  function walk(at, visited, path) {
    if (path.length && destinations.some(({ id }) => id === at)) {
      let required = demand;
      let transportCost = 0;
      const segments = [...path].reverse().map((edge) => {
        required /= 1 - edge.fuel;
        transportCost += required * edge.tariff;
        return {
          id: edge.id, name: edge.name, required, capacity: edge.capacity, capacitySource: edge.capacitySource,
          constrained: required - edge.capacity > 1e-9,
          ofos: notices.filter((notice) => edge.board && notice.board === edge.board),
        };
      }).reverse();
      const deliveredCost = (required * supplyPrice + transportCost) / demand;
      const netback = (demand * markets[at] - transportCost) / required;
      const margin = markets[at] - deliveredCost;
      if (![required, deliveredCost, netback, margin].every(Number.isFinite)) {
        throw new RangeError("Prices or volumes are too large to calculate this scenario.");
      }
      routes.push({
        destination: at, segments, path: [...visited], deliveredCost, netback, inletVolume: required,
        margin, feasible: !segments.some(({ constrained }) => constrained),
      });
    }
    for (const edge of graph.edges) {
      if (edge.from === at && !visited.has(edge.to)) walk(edge.to, new Set([...visited, edge.to]), [...path, edge]);
    }
  }
  walk(origin, new Set([origin]), []);
  const feasible = routes.filter((route) => route.feasible);
  const cheapest = feasible.reduce((best, route) => !best || route.deliveredCost < best.deliveredCost ? route : best, null);
  const bestNetback = feasible.reduce((best, route) => !best || route.netback > best.netback ? route : best, null);
  return { routes, cheapest, bestNetback };
}
