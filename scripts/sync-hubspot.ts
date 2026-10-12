// Step 7 on demand: push drafted startups that aren't in HubSpot yet.
import "./load-env"
import { syncPendingToHubSpot } from "../lib/outreach"
syncPendingToHubSpot(50).then((r) => {
  console.log(r)
  process.exit(0)
})
