# Player Shots on Target - Fotmob Data Analysis

## Data Sources in Fotmob Response

### 1. **Player Stats (Primary Source)**
Location: `matchDetails.playerStats[playerId].stats[]`

**Structure:**
```json
{
  "playerStats": {
    "1061249": {  // Player ID
      "name": "Vitinha",
      "stats": [
        {
          "title": "Attack",
          "key": "attack",
          "stats": {
            "Shots on target": {
              "key": "ShotsOnTarget",
              "stat": {
                "value": 3,        // ✅ THIS IS THE VALUE WE NEED
                "total": 5,         // Total shots
                "type": "fractionWithPercentage"
              }
            }
          }
        }
      ]
    }
  }
}
```

**Path to extract:**
- `matchDetails.playerStats[playerId].stats[]` - array of stat sections
- Find section with `title: "Attack"` or `key: "attack"`
- In that section's `stats` object, find `"Shots on target"` or key `"ShotsOnTarget"`
- Extract `stat.value` = **3** (shots on target)

### 2. **Shotmap (Fallback Source)**
Location: `matchDetails.shotmap[]` or `matchDetails.header.events.shotmap[]`

**Structure:**
```json
{
  "shotmap": [
    {
      "playerId": 1061249,
      "playerName": "Vitinha",
      "isOnTarget": true,    // ✅ Check this flag
      "eventType": "Goal" | "AttemptSaved" | "AttemptOffTarget"
    }
  ]
}
```

**How to calculate:**
- Filter shotmap by `playerId === targetPlayerId`
- Count entries where `isOnTarget === true`
- Result: Number of shots on target

**Example for Vitinha (playerId 1061249):**
- Total shots in shotmap: 5
- Shots with `isOnTarget: true`: 5 (all shots were on target)
- But stat says 3 - this might be because blocked shots are counted differently

### 3. **Goal Events with shotmapEvent (Secondary Fallback)**
Location: `matchDetails.header.events.homeTeamGoals` / `awayTeamGoals`

**Structure:**
```json
{
  "header": {
    "events": {
      "homeTeamGoals": {
        "Vitinha": [
          {
            "playerId": 1061249,
            "shotmapEvent": {
              "isOnTarget": true,  // ✅ Check this
              "playerId": 1061249
            }
          }
        ]
      }
    }
  }
}
```

**Note:** This only gives goals, not all shots on target.

## Recommended Extraction Logic

### Priority Order:

1. **Primary: Player Stats → Attack Section**
   ```javascript
   const player = matchDetails.playerStats[playerId];
   const attackSection = player.stats.find(s => s.key === 'attack' || s.title === 'Attack');
   const shotsOnTargetStat = attackSection?.stats?.['Shots on target'];
   const value = shotsOnTargetStat?.stat?.value; // 3
   ```

2. **Fallback 1: Player's own shotmap**
   ```javascript
   const playerShotmap = player.shotmap || [];
   const shotsOnTarget = playerShotmap.filter(s => s.isOnTarget === true).length;
   ```

3. **Fallback 2: Global shotmap**
   ```javascript
   const globalShotmap = matchDetails.shotmap || matchDetails.header?.events?.shotmap || [];
   const playerShots = globalShotmap.filter(s => 
     (s.playerId === playerId || s.shotmapEvent?.playerId === playerId) && 
     s.isOnTarget === true
   ).length;
   ```

4. **Fallback 3: Count from goal events (NOT RECOMMENDED)**
   - Only counts goals, not all shots on target
   - Should only be used if no other data available

## Example: Vitinha (playerId 1061249)

### From Stats:
- **Shots on target: 3** ✅ (Primary source)
- Total shots: 5
- Blocked shots: 2

### From Shotmap:
- Total shots: 5
- Shots with `isOnTarget: true`: 5
- **Note:** Discrepancy - shotmap shows 5 on target, but stat shows 3
- **Reason:** Blocked shots might be counted differently in stats vs shotmap

### Recommendation:
**Use the stat value (3) as it's the official Fotmob calculation.**

## Current Code Issues

1. ✅ Code already checks `playerStats[playerId].stats[]` - GOOD
2. ✅ Code looks for key `"shotsontarget"` or label includes "shots on target" - GOOD
3. ⚠️ Code might not be finding "Shots on target" in Attack section
4. ✅ Code has fallback to shotmap - GOOD
5. ❌ Code uses goals count as last fallback - BAD (goals ≠ shots on target)

## Fix Required

Update `getPlayerStats` to:
1. Check `stats[]` array for section with `key: "attack"` or `title: "Attack"`
2. In that section, look for `"Shots on target"` with key `"ShotsOnTarget"`
3. Extract `stat.value` (not `stat.total`)



