# Runtime petal IDs

Public client source: `/workspace/scratch/flowrix-test/online-client.wat`, decoded from `/tmp/flowrix-current-online.wasm` (SHA256 `0ac63cd3f85e71b6e176e85571e0390af3336207bbfce3d2111948ecb48c661f`).

The registry initializer builds the sorted item type vector from petal definitions **and generated mob eggs**. Sorting `/data/petals.json` by itself produces incorrect packet IDs.

Exact source evidence:

- Lines 575729–575743 collect mob and petal key vectors separately.
- Lines 575867–575879 compare the last four bytes of a mob key to `1952804959`, the little-endian ASCII constant `_pet`, and skip that mob.
- Lines 575930–575945 append `1734829407`, the little-endian ASCII constant `_egg`, to the mob key.
- Lines 575948–576105 binary-search the existing petal key vector and skip generation when the resulting egg key is already explicitly defined.
- Lines 576150–576210 copy the petal key vector.
- Lines 576309–576448 append generated egg keys to that vector.
- Lines 576470–576504 sort the combined vector (`call $f684`).

Equivalent lookup construction:

```js
function buildPetalIDs(petals, mobs) {
  const keys = Object.keys(petals);
  for (const mobKey of Object.keys(mobs)) {
    const eggKey = mobKey + '_egg';
    if (!mobKey.endsWith('_pet') && !Object.hasOwn(petals, eggKey)) {
      keys.push(eggKey);
    }
  }
  return keys.sort();
}
```

`noEggDrop` is intentionally irrelevant to registry allocation; it governs drop eligibility. Petal and mob names that collide remain distinct because the generated egg has `_egg` appended. Explicit egg petal definitions prevent duplicate allocation.

The native `/data/petals.json` contains 109 definitions and `/data/mobs.json` contains 70 definitions. Excluding `soldier_ant_pet` and `soldier_fire_ant_pet` produces 177 item IDs. Resulting IDs independently match the equipped packet observations in `/workspace/scratch/flowrix-test/trials-20261014-confirmed2-Desert-scorpion-live.json`: Stick 151, Shell 134, Root 125, Magnet 100, Bulb 18, Antennae 3, Powder 116. The downloaded public JSON fixture keys produce the same 177-ID table.

Generated egg names can be displayed as `${mobs[mobKey].name} Egg`; explicit petal definitions take precedence. If either authoritative registry cannot be loaded, return an unknown table and display `Petal #ID` instead of guessing from an incomplete table.

Native testing confirms the static transformation for this client version; it does not itself establish that a future or custom server uses the same definitions. Use the current client's authoritative registry sources.
