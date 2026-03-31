/**
 * 自己評価処理・ギャップ分析
 */

/**
 * 自己評価とAI評価のギャップを分析する
 * @param {Object} selfEval - 学生の自己評価データ
 * @param {Object} aiEval - AI評価結果
 * @param {number} level - 評価レベル
 * @return {Object} ギャップ分析結果
 */
function analyzeGap(selfEval, aiEval, level) {
  if (!selfEval || !aiEval) {
    return { available: false };
  }

  if (level === 1) {
    return analyzeGapLevel1(selfEval, aiEval);
  } else {
    return analyzeGapLevel2(selfEval, aiEval);
  }
}

/**
 * Level 1のギャップ分析（チェックボックス vs Good/Poor）
 */
function analyzeGapLevel1(selfEval, aiEval) {
  var items = aiEval.itemEvaluations || [];
  var selfChecks = selfEval.checks || {};
  var matches = 0;
  var total = 0;
  var gaps = [];

  items.forEach(function(item) {
    var selfChecked = selfChecks[item.id] === true;
    var aiGood = item.result === 'Good';
    total++;

    if (selfChecked === aiGood) {
      matches++;
    } else {
      gaps.push({
        itemId: item.id,
        itemName: item.name,
        selfResult: selfChecked ? 'できた' : 'できなかった',
        aiResult: item.result,
        type: selfChecked && !aiGood ? 'self_high' : 'self_low'
      });
    }
  });

  return {
    available: true,
    matchRate: total > 0 ? Math.round(matches / total * 100) : 0,
    matchCount: matches,
    totalCount: total,
    gaps: gaps
  };
}

/**
 * Level 2/3のギャップ分析（カテゴリ別5段階 vs AIスコア）
 */
function analyzeGapLevel2(selfEval, aiEval) {
  var categories = aiEval.categoryScores || {};
  var selfScores = selfEval.categoryScores || {};
  var gaps = [];
  var matchCount = 0;
  var totalCount = 0;

  var categoryKeys = Object.keys(categories);
  categoryKeys.forEach(function(key) {
    var cat = categories[key];
    var selfScore = selfScores[key];
    if (selfScore === undefined || selfScore === null) return;

    totalCount++;
    // 自己評価(1-5)をAIスコアの割合に変換して比較
    var selfPct = selfScore / 5;
    var aiPct = cat.maxScore > 0 ? cat.score / cat.maxScore : 0;
    var diff = selfPct - aiPct;

    var gapType = 'match';
    if (diff > 0.2) gapType = 'self_high';
    else if (diff < -0.2) gapType = 'self_low';
    else matchCount++;

    gaps.push({
      category: key,
      label: cat.label,
      selfScore: selfScore,
      aiScore: cat.score,
      aiMaxScore: cat.maxScore,
      type: gapType
    });
  });

  return {
    available: true,
    matchRate: totalCount > 0 ? Math.round(matchCount / totalCount * 100) : 0,
    matchCount: matchCount,
    totalCount: totalCount,
    gaps: gaps,
    freeComment: selfEval.freeComment || ''
  };
}
