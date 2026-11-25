export const dashboardTabs = [
  { id: "routes", label: "Routes & tariffs" },
  { id: "notices", label: "OFO notices" },
];

export function tabForKey(active, key) {
  const index = dashboardTabs.findIndex(({ id }) => id === active);
  const count = dashboardTabs.length;
  switch (key) {
    case "ArrowLeft": return dashboardTabs[(index - 1 + count) % count].id;
    case "ArrowRight": return dashboardTabs[(index + 1) % count].id;
    case "Home": return dashboardTabs[0].id;
    case "End": return dashboardTabs[count - 1].id;
    default: return null;
  }
}
