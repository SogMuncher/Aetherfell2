# Co-op networking (src/net, src/clock)

**Purpose:** host-authoritative P2P over PeerJS. Solo = a host with no guests. Net moves plain data; it knows no rules.
**Never:** put rules in net; send non-plain objects; rename released ids (saves and messages store them).

- Join: host sends a compressed save, then 10 Hz entity snapshots (within 220 m of that friend plus all travellers) and events.
- Two roads per friend: reliable/ordered (join, presses, events, shared record) and unreliable `fast` (movement, snapshots).
- Prediction: `net/prediction.ts` + `Simulation.predict` run the host's own rules on the guest; replay unanswered inputs by `seq`.
- Messages and validation: `net/messages.ts` (every incoming message is validated). Transport: `net/net.ts`.
- Clock: `clock/ticker.ts` steps the sim in a hidden tab; `requestAnimationFrame` only draws.
- Presence: guests `ping` every 2 s; silent ones let go after `rules.coop.timeout`. Characters wait in `state.absent` and
  return by `aetherfell2.friendId`.
- Shared record (journal, quests, places, feelings) goes out as a `shared` message on change.
- Realms: the party travels together; host sends `realmChanged`, guests `followRealm`.
- Self-hosted signalling: `?peer=host:port`.

## Add / change
New message = type in `types/net.ts` + validator in `messages.ts` + handler in `net.ts`. New synced state belongs in `SimState`.

## Checks
`scripts/coopSmoke.ts` (every mechanic that touches state should hold for a guest too).
