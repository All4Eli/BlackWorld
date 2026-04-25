// ═══════════════════════════════════════════════════════════════════
// BLACKWORLD — BLOOD STONE PACK DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export const BLOOD_STONE_PACKS = {
  shard: {
    key: 'shard',
    name: 'Shard Pack',
    price: 499,          // cents
    displayPrice: '$4.99',
    bloodStones: 75,
    donatorDays: 31,
    bonus: null,
    icon: '[I]',
    description: '75 Blood Stones + 31 days Donator status',
    color: '#3b82f6',
  },
  core: {
    key: 'core',
    name: 'Core Pack',
    price: 999,
    displayPrice: '$9.99',
    bloodStones: 175,
    donatorDays: 31,
    bonus: '+1 Enhancement Protection Scroll',
    icon: '[II]',
    description: '175 Blood Stones + 31 days Donator + 1 Protection Scroll',
    color: '#8b5cf6',
  },
  rift: {
    key: 'rift',
    name: 'Rift Pack',
    price: 2499,
    displayPrice: '$24.99',
    bloodStones: 500,
    donatorDays: 31,
    bonus: '+3 Enhancement Protection Scrolls',
    icon: '[III]',
    description: '500 Blood Stones + 31 days Donator + 3 Protection Scrolls',
    color: '#f59e0b',
  },
  sovereign: {
    key: 'sovereign',
    name: 'Sovereign Pack',
    price: 4999,
    displayPrice: '$49.99',
    bloodStones: 1200,
    donatorDays: 62,
    bonus: '+7 Enhancement Protection Scrolls + Exclusive Profile Border',
    icon: '[IV]',
    description: '1,200 Blood Stones + 62 days Donator + 7 Protection Scrolls + Exclusive Border',
    color: '#ef4444',
  },
};

export const DARK_PACT = {
  name: 'Dark Pact',
  price: 599,            // cents/month
  displayPrice: '$5.99/mo',
  dailyStipend: 15,      // BS per day
  monthlyStones: 450,
  maxEssenceBonus: 50,
  essenceRegenBonus: 0.25,
  inventorySlots: 20,
  icon: '🩸',
  perks: [
    { name: 'Daily Blood Stone Stipend', desc: '+15 Blood Stones per day (450/mo)' },
    { name: 'Max Essence Increase', desc: '+50 Blood Essence cap (100 → 150)' },
    { name: 'Essence Regen Boost', desc: '+25% faster regeneration' },
    { name: 'Auto-Loot', desc: 'Combat loot is automatically picked up' },
    { name: 'Expanded Inventory', desc: '+20 inventory slots (while subscribed)' },
    { name: 'Dark Pact Name Glow', desc: 'Crimson glow on your name' },
    { name: 'Priority Queue', desc: 'Cooldown timers reduced by 25%' },
    { name: 'Bank Interest', desc: '+0.1% daily interest (capped 100g/day)' },
    { name: 'Monthly Special Item', desc: 'One random RARE+ item on renewal' },
    { name: 'Donator Badge', desc: '** double icon on name' },
  ],
};

export const BS_SHOP_ITEMS = [
  { key: 'protection_scroll', name: 'Enhancement Protection Scroll', cost: 50, icon: '[S]', desc: 'Prevents item break on one failed enhancement', category: 'utility' },
  { key: 'essence_refill', name: 'Essence Refill', cost: 20, icon: '[E]', desc: 'Instantly refills Blood Essence to max', category: 'utility' },
  { key: 'inventory_expansion', name: 'Inventory Expansion (+10)', cost: 200, icon: '[+]', desc: 'Permanent +10 inventory slots (max 5×)', category: 'permanent' },
  { key: 'name_color_crimson', name: 'Name Color: Crimson', cost: 300, icon: '[C]', desc: 'Permanent crimson name color', category: 'cosmetic' },
  { key: 'name_color_amber', name: 'Name Color: Amber', cost: 300, icon: '[A]', desc: 'Permanent amber name color', category: 'cosmetic' },
  { key: 'name_color_void', name: 'Name Color: Void', cost: 300, icon: '[V]', desc: 'Permanent void purple name color', category: 'cosmetic' },
  { key: 'loot_charm', name: 'Loot Charm (24h)', cost: 30, icon: '[L]', desc: '+10% loot drop chance for 24 hours', category: 'booster' },
  { key: 'xp_incense', name: 'XP Incense (24h)', cost: 30, icon: '[X]', desc: '+15% XP gain for 24 hours', category: 'booster' },
  { key: 'flask_restock', name: 'Flask Restock', cost: 15, icon: '[F]', desc: 'Refill all combat flasks immediately', category: 'utility' },
];
