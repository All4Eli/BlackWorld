export function incrementQuestProgress(hero, typeLabel, amount) {
    if (!hero.accepted_quests) return;
    let updated = false;
    hero.accepted_quests.forEach(q => {
        if (q.type === typeLabel && (q.progress || 0) < q.target) {
            q.progress = (q.progress || 0) + amount;
            updated = true;
        }
    });
    return updated;
}
