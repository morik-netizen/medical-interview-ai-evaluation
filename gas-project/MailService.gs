/**
 * Gmail送信処理（計画書v2準拠）
 * GmailApp.sendEmail() で評価結果を学生に送信
 */

/**
 * 評価結果をGmailで学生に送信
 * @param {Object} params
 *   - studentName: 学生名
 *   - email: 送信先Gmailアドレス
 *   - result: 評価結果オブジェクト
 *   - level: 評価レベル
 * @return {Object} 送信結果
 */
function sendResultEmail(params) {
  try {
    if (!params.email) {
      return { success: false, error: 'メールアドレスが指定されていません' };
    }

    var eval_ = params.result.evaluation || {};
    var meta = params.result.meta || {};
    var gap = params.result.gapAnalysis || {};
    var level = params.level || meta.level || 2;

    var dateStr = formatDateJP(meta.timestamp);
    var subject = '【医療面接AI評価】' + dateStr + ' 評価結果';

    var body;
    if (level === 1) {
      body = buildLevel1Email(eval_, meta, gap);
    } else {
      body = buildLevel2Email(eval_, meta, gap, level);
    }

    GmailApp.sendEmail(params.email, subject, '', {
      htmlBody: body,
      name: '医療面接AI評価システム'
    });

    Logger.log('メール送信完了: ' + params.email);
    return { success: true };

  } catch (e) {
    Logger.log('メール送信エラー: ' + e.toString());
    return { success: false, error: 'メール送信に失敗しました: ' + e.toString() };
  }
}

/**
 * Level 1 用メール本文を構築
 */
function buildLevel1Email(eval_, meta, gap) {
  var checkCount = eval_.checkCount || 0;
  var totalItems = eval_.totalItems || 10;

  var html = [
    '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">',
    '<h2 style="color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 8px;">',
    '医療面接 AI評価レポート</h2>',
    '<p><strong>学生名：</strong>' + escHtml(meta.studentName || '') + '</p>',
    '<p><strong>日時：</strong>' + formatDateJP(meta.timestamp) + '</p>',
    '<p><strong>面接種別：</strong>' + (meta.interviewType === 'real' ? '実患者面接' : '模擬面接') + '</p>',
    '<p><strong>レベル：</strong>Level 1（入門）</p>',
    '<hr>',
    '',
    '<div style="background: #e8f5e9; padding: 16px; border-radius: 8px; text-align: center; margin: 16px 0;">',
    '<h3 style="margin: 0; color: #2e7d32;">✅ ' + checkCount + ' / ' + totalItems + ' できました！</h3>',
    '</div>'
  ];

  // できた項目
  if (eval_.itemEvaluations) {
    html.push('<h3>項目別結果</h3>');
    html.push('<table style="width: 100%; border-collapse: collapse;">');
    eval_.itemEvaluations.forEach(function(item) {
      var icon = item.result === 'Good' ? '&#10004;' : (item.result === 'Partial' ? '&#9670;' : '&#8213;');
      html.push('<tr style="border-bottom: 1px solid #eee;">');
      html.push('<td style="padding: 6px;">' + icon + '</td>');
      html.push('<td style="padding: 6px;">' + escHtml(item.name || '') + '</td>');
      html.push('<td style="padding: 6px; color: #666;">' + escHtml(item.result || '') + '</td>');
      html.push('</tr>');
    });
    html.push('</table>');
  }

  // 次のアクション
  if (eval_.nextAction) {
    html.push('<div style="background: #fff3e0; padding: 16px; border-radius: 8px; margin: 16px 0;">');
    html.push('<h3 style="margin: 0 0 8px 0; color: #e65100;">次にチャレンジ！</h3>');
    html.push('<p><strong>' + escHtml(eval_.nextAction.title || '') + '</strong></p>');
    if (eval_.nextAction.script) {
      html.push('<p style="background: #fff; padding: 12px; border-left: 4px solid #ff9800; margin: 8px 0;">');
      html.push('&#128172; ' + escHtml(eval_.nextAction.script));
      html.push('</p>');
    }
    if (eval_.nextAction.tip) {
      html.push('<p>&#128161; ' + escHtml(eval_.nextAction.tip) + '</p>');
    }
    html.push('</div>');
  }

  // 総合コメント
  if (eval_.overallComment) {
    html.push('<h3>コメント</h3>');
    html.push('<p>' + escHtml(eval_.overallComment) + '</p>');
  }

  html.push(getEmailFooter());
  html.push('</div>');

  return html.join('\n');
}

/**
 * Level 2/3 用メール本文を構築
 */
function buildLevel2Email(eval_, meta, gap, level) {
  var html = [
    '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">',
    '<h2 style="color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 8px;">',
    '医療面接 AI評価レポート</h2>',
    '<p><strong>学生名：</strong>' + escHtml(meta.studentName || '') + '</p>',
    '<p><strong>日時：</strong>' + formatDateJP(meta.timestamp) + '</p>',
    '<p><strong>面接種別：</strong>' + (meta.interviewType === 'real' ? '実患者面接' : '模擬面接') + '</p>',
    '<p><strong>レベル：</strong>Level ' + level + (level === 2 ? '（基本）' : '（応用）') + '</p>',
    '<hr>'
  ];

  // 総合スコア
  var gradeColor = getGradeColor(eval_.grade);
  html.push('<div style="background: #e3f2fd; padding: 16px; border-radius: 8px; text-align: center; margin: 16px 0;">');
  html.push('<h3 style="margin: 0;">総合スコア: <span style="font-size: 1.5em;">' + (eval_.totalScore || '---') + '</span> / 100点</h3>');
  html.push('<p style="font-size: 1.2em; margin: 8px 0 0 0;">グレード: <span style="color: ' + gradeColor + '; font-weight: bold;">' + escHtml(eval_.grade || '') + '</span></p>');
  html.push('</div>');

  // カテゴリ別スコア
  if (eval_.categoryScores) {
    html.push('<h3>カテゴリ別スコア</h3>');
    html.push('<table style="width: 100%; border-collapse: collapse;">');
    html.push('<tr style="background: #f5f5f5;"><th style="padding: 8px; text-align: left;">カテゴリ</th><th style="padding: 8px; text-align: right;">スコア</th></tr>');
    var cats = Object.keys(eval_.categoryScores);
    cats.forEach(function(key) {
      var cat = eval_.categoryScores[key];
      var pct = cat.maxScore > 0 ? Math.round(cat.score / cat.maxScore * 100) : 0;
      html.push('<tr style="border-bottom: 1px solid #eee;">');
      html.push('<td style="padding: 8px;">' + escHtml(cat.label || key) + '</td>');
      html.push('<td style="padding: 8px; text-align: right;">' + cat.score + ' / ' + cat.maxScore + '（' + pct + '%）</td>');
      html.push('</tr>');
    });
    html.push('</table>');
  }

  // ギャップ分析
  if (gap && gap.available) {
    html.push('<h3>自己評価 vs AI評価</h3>');
    html.push('<p>一致率: <strong>' + gap.matchRate + '%</strong></p>');
    if (gap.gaps && gap.gaps.length > 0) {
      html.push('<table style="width: 100%; border-collapse: collapse;">');
      gap.gaps.forEach(function(g) {
        var gapLabel = g.type === 'self_high' ? '自己高・AI低' : (g.type === 'self_low' ? '自己低・AI高 ✨' : '一致');
        html.push('<tr style="border-bottom: 1px solid #eee;">');
        html.push('<td style="padding: 6px;">' + escHtml(g.label || g.category || g.itemName || '') + '</td>');
        html.push('<td style="padding: 6px;">' + gapLabel + '</td>');
        html.push('</tr>');
      });
      html.push('</table>');
    }
  }

  // 最優先アクション
  if (eval_.topPriority) {
    html.push('<div style="background: #fff3e0; padding: 16px; border-radius: 8px; margin: 16px 0;">');
    html.push('<h3 style="margin: 0 0 8px 0; color: #e65100;">⚡ 最優先アクション</h3>');
    html.push('<p>' + escHtml(eval_.topPriority) + '</p>');
    html.push('</div>');
  }

  // 良かった点
  if (eval_.strengths && eval_.strengths.length > 0) {
    html.push('<h3>良かった点</h3>');
    html.push('<ol>');
    eval_.strengths.forEach(function(s) {
      html.push('<li><strong>' + escHtml(s.point || '') + '</strong><br>' + escHtml(s.detail || '') + '</li>');
    });
    html.push('</ol>');
  }

  // 改善点
  if (eval_.improvements && eval_.improvements.length > 0) {
    html.push('<h3>改善点とアドバイス</h3>');
    html.push('<ol>');
    eval_.improvements.forEach(function(imp) {
      html.push('<li><strong>' + escHtml(imp.point || '') + '</strong><br>');
      html.push(escHtml(imp.detail || ''));
      if (imp.example) {
        html.push('<br>&#128172; 例: <em>' + escHtml(imp.example) + '</em>');
      }
      html.push('</li>');
    });
    html.push('</ol>');
  }

  // 自己省察の問い（Level 3）
  if (level === 3 && eval_.reflectionQuestions && eval_.reflectionQuestions.length > 0) {
    html.push('<h3>自己省察のための問い</h3>');
    eval_.reflectionQuestions.forEach(function(q, i) {
      html.push('<p><strong>Q' + (i + 1) + '. ' + escHtml(q.question || '') + '</strong></p>');
      if (q.hint) {
        html.push('<p style="color: #666; margin-left: 16px;">ヒント: ' + escHtml(q.hint) + '</p>');
      }
    });
  }

  // 総合コメント
  if (eval_.overallComment) {
    html.push('<h3>総合コメント</h3>');
    html.push('<p>' + escHtml(eval_.overallComment) + '</p>');
  }

  // 次回目標
  if (eval_.nextGoals && eval_.nextGoals.length > 0) {
    html.push('<h3>次回の目標</h3>');
    html.push('<ul>');
    eval_.nextGoals.forEach(function(goal) {
      html.push('<li>' + escHtml(goal) + '</li>');
    });
    html.push('</ul>');
  }

  html.push(getEmailFooter());
  html.push('</div>');

  return html.join('\n');
}

/**
 * メールフッター
 */
function getEmailFooter() {
  return [
    '<hr style="margin-top: 24px;">',
    '<p style="color: #999; font-size: 0.85em;">',
    '※ この評価はAI（Claude Sonnet 4.6）によるテキストベースの自動評価です。<br>',
    '※ 非言語コミュニケーション（表情・姿勢・声のトーン等）は評価対象外です。<br>',
    '※ 最終的な評価は教員が行います。この結果は参考・自己学習支援用です。<br>',
    '※ 医療面接AI評価システム（朝日医療大学校 柔道整復学科）',
    '</p>'
  ].join('\n');
}

/**
 * グレードに応じた色を返す
 */
function getGradeColor(grade) {
  var colors = {
    'S': '#1b5e20',
    'A': '#2e7d32',
    'B': '#1565c0',
    'C': '#e65100',
    '成長中': '#7b1fa2'
  };
  return colors[grade] || '#333';
}

/**
 * タイムスタンプを日本語表記にフォーマット
 */
function formatDateJP(timestamp) {
  try {
    var d = timestamp ? new Date(timestamp) : new Date();
    var year = d.getFullYear();
    var month = d.getMonth() + 1;
    var day = d.getDate();
    var hours = ('0' + d.getHours()).slice(-2);
    var minutes = ('0' + d.getMinutes()).slice(-2);
    return year + '年' + month + '月' + day + '日 ' + hours + ':' + minutes;
  } catch (e) {
    return '日時不明';
  }
}

/**
 * HTMLエスケープ
 */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 学生のメールアドレスを取得（学生マスターから）
 */
function getStudentEmail(studentName) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('学生マスター');
    if (!sheet) return null;

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === studentName) {
        return data[i][1] || null;
      }
    }
    return null;
  } catch (e) {
    Logger.log('メールアドレス取得エラー: ' + e.toString());
    return null;
  }
}
