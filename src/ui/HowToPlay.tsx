/** The rules in a nutshell (Home "How to play" sheet and Settings → About). */
export function HowToPlay() {
  return (
    <>
      <h2>How to play</h2>
      <ul>
        <li><b>Normal chess</b>, White first, 10 minutes each. Run out of time and you lose.</li>
        <li>Start each turn by <b>drawing a card</b>: a <b>1, 2 or 3</b> means that many moves in a row. 3s are rare: the 52-card deck has 19 ones, 18 twos and just 5 threes (about 1.7 moves a turn on average), plus 6 Skip and 4 Reverse.</li>
        <li><b>Giving check ends your turn</b> immediately. Set up quietly, then check on your last move.</li>
        <li>White's very first turn is capped at <b>1 move</b>.</li>
        <li><b>Skip</b> and <b>Reverse</b> go into your hand (max 2). Play one at the start of a turn, before drawing.</li>
        <li><b>Skip:</b> take your turn, then your opponent's next turn is skipped. Check cancels Skip.</li>
        <li><b>Reverse:</b> swap sides with your opponent (uses your turn). Unlocks after 5 turns each, no Reverse straight back, and <b>only one Reverse per player per game</b>. After yours is used, any Reverse you draw is discarded and you draw again.</li>
      </ul>
    </>
  );
}
