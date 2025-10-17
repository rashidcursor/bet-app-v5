/**
 * Comprehensive Bet Result Checker
 * Determines if a bet was won or lost based on match data and bet details
 */

export const checkBetResult = (matchData, betData) => {
  const {
    homeScore,
    awayScore,
    halfTimeHomeScore,
    halfTimeAwayScore,
    corners,
    cards,
    bookings,
    goals,
    penalties
  } = matchData;

  const { market, selection, handicap, total, player } = betData;

  // Helper functions
  const isHomeWin = () => homeScore > awayScore;
  const isAwayWin = () => awayScore > homeScore;
  const isDraw = () => homeScore === awayScore;
  const isOver = (value, threshold) => value > threshold;
  const isUnder = (value, threshold) => value < threshold;
  const isExact = (value, target) => value === target;
  const totalGoals = () => homeScore + awayScore;
  const halfTimeTotalGoals = () => halfTimeHomeScore + halfTimeAwayScore;
  const secondHalfHomeScore = () => homeScore - halfTimeHomeScore;
  const secondHalfAwayScore = () => awayScore - halfTimeAwayScore;
  const secondHalfTotalGoals = () => secondHalfHomeScore() + secondHalfAwayScore();

  switch (market.toLowerCase()) {
    // Basic Result Markets
    case 'fulltime result':
    case 'match result':
    case '1x2':
      if (selection === '1' || selection.toLowerCase() === 'home') return isHomeWin();
      if (selection === 'x' || selection.toLowerCase() === 'draw') return isDraw();
      if (selection === '2' || selection.toLowerCase() === 'away') return isAwayWin();
      break;

    case 'double chance':
      if (selection === '1x') return isHomeWin() || isDraw();
      if (selection === 'x2') return isAwayWin() || isDraw();
      if (selection === '12') return isHomeWin() || isAwayWin();
      break;

    case 'draw no bet':
      if (isDraw()) return 'void'; // Stake returned
      if (selection === '1' || selection.toLowerCase() === 'home') return isHomeWin();
      if (selection === '2' || selection.toLowerCase() === 'away') return isAwayWin();
      break;

    // Goal Markets
    case 'both teams to score':
    case 'btts':
      const bothTeamsScored = homeScore > 0 && awayScore > 0;
      return selection.toLowerCase() === 'yes' ? bothTeamsScored : !bothTeamsScored;

    case 'both teams to score in 1st half':
      const bothTeamsScored1H = halfTimeHomeScore > 0 && halfTimeAwayScore > 0;
      return selection.toLowerCase() === 'yes' ? bothTeamsScored1H : !bothTeamsScored1H;

    case 'both teams to score in 2nd half':
      const bothTeamsScored2H = secondHalfHomeScore() > 0 && secondHalfAwayScore() > 0;
      return selection.toLowerCase() === 'yes' ? bothTeamsScored2H : !bothTeamsScored2H;

    case 'goal in both halves':
      // Check if the selected team scored in both halves
      if (selection.toLowerCase() === 'home') {
        return halfTimeHomeScore > 0 && secondHalfHomeScore() > 0;
      } else if (selection.toLowerCase() === 'away') {
        return halfTimeAwayScore > 0 && secondHalfAwayScore() > 0;
      }
      return false;

    case 'home team exact goals':
      return isExact(homeScore, parseInt(selection));

    case 'away team exact goals':
      return isExact(awayScore, parseInt(selection));

    case 'first half exact goals':
      return isExact(halfTimeTotalGoals(), parseInt(selection));

    case 'second half exact goals':
      return isExact(secondHalfTotalGoals(), parseInt(selection));

    case 'total goals':
    case 'match goals':
    case 'goals over/under':
      if (selection.toLowerCase().includes('over')) return isOver(totalGoals(), total);
      if (selection.toLowerCase().includes('under')) return isUnder(totalGoals(), total);
      break;

    case 'alternative total goals':
    case 'alternative match goals':
      if (selection.toLowerCase().includes('over')) return isOver(totalGoals(), total);
      if (selection.toLowerCase().includes('under')) return isUnder(totalGoals(), total);
      break;

    case 'exact total goals':
      return isExact(totalGoals(), parseInt(selection));

    // Handicap Markets
    case 'asian handicap':
      const homeWithHandicap = homeScore + handicap;
      const awayWithHandicap = awayScore - handicap;
      if (homeWithHandicap > awayWithHandicap) return selection === '1';
      if (awayWithHandicap > homeWithHandicap) return selection === '2';
      return 'void'; // Draw with handicap

    case '3-way handicap':
      const homeWith3WayHandicap = homeScore + handicap;
      if (selection === '1') return homeWith3WayHandicap > awayScore;
      if (selection === 'x') return homeWith3WayHandicap === awayScore;
      if (selection === '2') return homeWith3WayHandicap < awayScore;
      break;

    // Odd/Even Markets
    case 'odd/even':
    case 'goals odd/even':
      const isOdd = totalGoals() % 2 === 1;
      return selection.toLowerCase() === 'odd' ? isOdd : !isOdd;

    case 'home odd/even':
      const homeIsOdd = homeScore % 2 === 1;
      return selection.toLowerCase() === 'odd' ? homeIsOdd : !homeIsOdd;

    case 'away odd/even':
      const awayIsOdd = awayScore % 2 === 1;
      return selection.toLowerCase() === 'odd' ? awayIsOdd : !awayIsOdd;

    case 'odd/even 1st half':
      const firstHalfIsOdd = halfTimeTotalGoals() % 2 === 1;
      return selection.toLowerCase() === 'odd' ? firstHalfIsOdd : !firstHalfIsOdd;

    // Half Time Markets
    case 'half time result':
    case 'ht result':
      if (selection === '1') return halfTimeHomeScore > halfTimeAwayScore;
      if (selection === 'x') return halfTimeHomeScore === halfTimeAwayScore;
      if (selection === '2') return halfTimeHomeScore < halfTimeAwayScore;
      break;

    case 'half time/full time':
    case 'ht/ft':
      const [htResult, ftResult] = selection.split('/');
      const htCorrect = checkBetResult(
        { ...matchData, homeScore: halfTimeHomeScore, awayScore: halfTimeAwayScore },
        { market: 'match result', selection: htResult }
      );
      const ftCorrect = checkBetResult(matchData, { market: 'match result', selection: ftResult });
      return htCorrect && ftCorrect;

    case '1st half goals':
      if (selection.toLowerCase().includes('over')) return isOver(halfTimeTotalGoals(), total);
      if (selection.toLowerCase().includes('under')) return isUnder(halfTimeTotalGoals(), total);
      break;

    case '2nd half goals':
      if (selection.toLowerCase().includes('over')) return isOver(secondHalfTotalGoals(), total);
      if (selection.toLowerCase().includes('under')) return isUnder(secondHalfTotalGoals(), total);
      break;

    case 'to win 1st half':
      if (selection === 'home') return halfTimeHomeScore > halfTimeAwayScore;
      if (selection === 'away') return halfTimeAwayScore > halfTimeHomeScore;
      break;

    case 'to win 2nd half':
      if (selection === 'home') return secondHalfHomeScore() > secondHalfAwayScore();
      if (selection === 'away') return secondHalfAwayScore() > secondHalfHomeScore();
      break;

    // Clean Sheet Markets
    case 'clean sheet - home':
      return selection.toLowerCase() === 'yes' ? awayScore === 0 : awayScore > 0;

    case 'clean sheet - away':
      return selection.toLowerCase() === 'yes' ? homeScore === 0 : homeScore > 0;

    case 'team clean sheet':
      if (selection.toLowerCase().includes('home')) return awayScore === 0;
      if (selection.toLowerCase().includes('away')) return homeScore === 0;
      break;

    // Win to Nil
    case 'win to nil':
    case 'win to nil - home':
      if (selection.toLowerCase().includes('home')) return isHomeWin() && awayScore === 0;
      if (selection.toLowerCase().includes('away')) return isAwayWin() && homeScore === 0;
      break;

    case 'win to nil - away':
      return isAwayWin() && homeScore === 0;

    // Both Halves Markets
    case 'home team win both halves':
      return halfTimeHomeScore > halfTimeAwayScore && secondHalfHomeScore() > secondHalfAwayScore();

    case 'away team win both halves':
      return halfTimeAwayScore > halfTimeHomeScore && secondHalfAwayScore() > secondHalfHomeScore();

    case 'to win both halves':
      if (selection === 'home') return halfTimeHomeScore > halfTimeAwayScore && secondHalfHomeScore() > secondHalfAwayScore();
      if (selection === 'away') return halfTimeAwayScore > halfTimeHomeScore && secondHalfAwayScore() > secondHalfHomeScore();
      break;

    // Scoring Markets
    case 'first team to score':
      if (!goals || goals.length === 0) return selection.toLowerCase() === 'no goal';
      const firstGoal = goals.sort((a, b) => a.minute - b.minute)[0];
      return selection.toLowerCase() === firstGoal.team.toLowerCase();

    case 'last team to score':
      if (!goals || goals.length === 0) return selection.toLowerCase() === 'no goal';
      const lastGoal = goals.sort((a, b) => b.minute - a.minute)[0];
      return selection.toLowerCase() === lastGoal.team.toLowerCase();

    // Correct Score
    case 'correct score':
    case 'final score':
      const [expectedHome, expectedAway] = selection.split('-').map(Number);
      return homeScore === expectedHome && awayScore === expectedAway;

    case 'correct score 1st half':
    case 'half time correct score':
      const [expectedHT_Home, expectedHT_Away] = selection.split('-').map(Number);
      return halfTimeHomeScore === expectedHT_Home && halfTimeAwayScore === expectedHT_Away;

    // Corner Markets
    case 'total corners':
    case 'corners over/under':
      const totalCorners = corners?.total || 0;
      if (selection.toLowerCase().includes('over')) return isOver(totalCorners, total);
      if (selection.toLowerCase().includes('under')) return isUnder(totalCorners, total);
      break;

    case 'corner match bet':
    case 'most corners':
      const homeCorners = corners?.home || 0;
      const awayCorners = corners?.away || 0;
      if (selection === 'home') return homeCorners > awayCorners;
      if (selection === 'away') return awayCorners > homeCorners;
      if (selection === 'tie') return homeCorners === awayCorners;
      break;

    // Card Markets
    case 'total cards':
      const totalCards = cards?.total || 0;
      if (selection.toLowerCase().includes('over')) return isOver(totalCards, total);
      if (selection.toLowerCase().includes('under')) return isUnder(totalCards, total);
      break;

    case 'both teams to receive a card':
      const homeCards = cards?.home || 0;
      const awayCards = cards?.away || 0;
      const bothTeamsCard = homeCards > 0 && awayCards > 0;
      return selection.toLowerCase() === 'yes' ? bothTeamsCard : !bothTeamsCard;

    // Penalty Markets
    case 'penalty in the match':
      const penaltyInMatch = penalties?.total > 0;
      return selection.toLowerCase() === 'yes' ? penaltyInMatch : !penaltyInMatch;

    // Player Markets (requires additional player data)
    case 'player to score':
    case 'anytime goalscorer':
      if (!goals) return false;
      return goals.some(goal => goal.player?.toLowerCase() === player?.toLowerCase());

    case 'first goalscorer':
      if (!goals || goals.length === 0) return selection.toLowerCase() === 'no goalscorer';
      const firstScorer = goals.sort((a, b) => a.minute - b.minute)[0];
      return firstScorer.player?.toLowerCase() === player?.toLowerCase();

    // Winning Margin
    case 'winning margin':
      const margin = Math.abs(homeScore - awayScore);
      if (isDraw()) return selection.toLowerCase() === 'draw';
      const winner = isHomeWin() ? 'home' : 'away';
      return selection.toLowerCase().includes(winner) && selection.includes(margin.toString());

    default:
      console.warn(`Unknown market: ${market}`);
      return null; // Unknown market
  }

  return false;
};

/**
 * Helper function to determine if a bet should be voided
 */
export const isBetVoided = (result) => {
  return result === 'void';
};

/**
 * Main function to get bet result with status
 */
export const getBetResult = (matchData, betData) => {
  const result = checkBetResult(matchData, betData);
  
  if (result === 'void') {
    return { status: 'void', won: false, message: 'Bet voided - stake returned' };
  }
  
  if (result === null) {
    return { status: 'unknown', won: false, message: 'Unknown market or insufficient data' };
  }
  
  return { 
    status: result ? 'won' : 'lost', 
    won: result, 
    message: result ? 'Bet won' : 'Bet lost' 
  };
};

export default { checkBetResult, isBetVoided, getBetResult }; 