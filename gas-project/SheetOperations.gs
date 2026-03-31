/**
 * Google Sheets読み書き（学生マスター、評価履歴）
 */

/** スプレッドシートIDをスクリプトプロパティから取得 */
function getSpreadsheet() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) {
    throw new Error('SPREADSHEET_IDが設定されていません。スクリプトプロパティに設定してください。');
  }
  return SpreadsheetApp.openById(ssId);
}

/**
 * 評価結果をGoogle Sheetsに保存
 * @param {Object} result - 評価結果
 * @param {Object} selfEval - 自己評価データ
 * @param {string} anonymizedText - 匿名化済みテキスト
 */
function saveResult(result, selfEval, anonymizedText) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('評価履歴');
    if (!sheet) {
      // 評価履歴シートがなければ作成
      sheet = ss.insertSheet('評価履歴');
      sheet.appendRow([
        'タイムスタンプ', '学生名', 'レベル', '面接種別',
        '自己評価データ', 'AI総合スコア', 'グレード',
        'カテゴリ別スコア', 'ギャップ分析', '最優先アクション',
        '次回目標', '匿名化テキスト', 'AI評価全文'
      ]);
    }

    var eval_ = result.evaluation || {};
    var meta = result.meta || {};

    sheet.appendRow([
      meta.timestamp || new Date().toISOString(),
      meta.studentName || '',
      meta.level || '',
      meta.interviewType || '',
      JSON.stringify(selfEval || {}),
      eval_.totalScore || '',
      eval_.grade || '',
      JSON.stringify(eval_.categoryScores || {}),
      JSON.stringify(result.gapAnalysis || {}),
      eval_.topPriority || '',
      JSON.stringify(eval_.nextGoals || []),
      anonymizedText || '',
      JSON.stringify(eval_)
    ]);

    Logger.log('評価結果をSheetsに保存しました: ' + meta.studentName);
  } catch (e) {
    Logger.log('Sheets保存エラー（評価自体は正常完了）: ' + e.toString());
  }
}

/**
 * 学生の最新の評価結果を取得（前回比較用）
 * @param {string} studentName
 * @return {Object|null}
 */
function getLatestResult(studentName) {
  try {
    if (!studentName) return null;

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('評価履歴');
    if (!sheet) return null;

    var data = sheet.getDataRange().getValues();
    // 最新のものを探す（下から検索）
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][1] === studentName) {
        return {
          timestamp: data[i][0],
          level: data[i][2],
          totalScore: data[i][5],
          grade: data[i][6],
          categoryScores: safeJsonParse(data[i][7]),
          topPriority: data[i][9],
          nextGoals: safeJsonParse(data[i][10])
        };
      }
    }
    return null;
  } catch (e) {
    Logger.log('前回結果取得エラー: ' + e.toString());
    return null;
  }
}

/**
 * 学生の評価履歴を全件取得
 * @param {string} studentName
 * @return {Array}
 */
function getStudentHistory(studentName) {
  try {
    if (!studentName) return [];

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('評価履歴');
    if (!sheet) return [];

    var data = sheet.getDataRange().getValues();
    var history = [];
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] === studentName) {
        history.push({
          timestamp: data[i][0],
          level: data[i][2],
          totalScore: data[i][5],
          grade: data[i][6],
          categoryScores: safeJsonParse(data[i][7]),
          topPriority: data[i][9]
        });
      }
    }
    return history;
  } catch (e) {
    Logger.log('履歴取得エラー: ' + e.toString());
    return [];
  }
}

function safeJsonParse(str) {
  try {
    if (typeof str === 'string') return JSON.parse(str);
    return str || {};
  } catch (e) {
    return {};
  }
}

/**
 * スプレッドシート初期セットアップ
 * 学生マスター＋評価履歴シートを作成
 */
function setupSpreadsheet() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var ss;

  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
    Logger.log('既存スプレッドシートを使用: ' + ss.getName());
  } else {
    ss = SpreadsheetApp.create('医療面接AI評価_データ');
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    Logger.log('新規スプレッドシート作成: ' + ss.getUrl());
  }

  // 学生マスター
  var masterSheet = ss.getSheetByName('学生マスター');
  if (!masterSheet) {
    masterSheet = ss.insertSheet('学生マスター');
    masterSheet.appendRow(['学生番号', '学生氏名', 'メールアドレス']);
    masterSheet.appendRow(['KJP001', '（サンプル）山田太郎', 'sample@example.com']);
    Logger.log('✅ 学生マスターシート作成完了');
  }

  // 評価履歴
  var historySheet = ss.getSheetByName('評価履歴');
  if (!historySheet) {
    historySheet = ss.insertSheet('評価履歴');
    historySheet.appendRow([
      'タイムスタンプ', '学生名', 'レベル', '面接種別',
      '自己評価データ', 'AI総合スコア', 'グレード',
      'カテゴリ別スコア', 'ギャップ分析', '最優先アクション',
      '次回目標', '匿名化テキスト', 'AI評価全文'
    ]);
    Logger.log('✅ 評価履歴シート作成完了');
  }

  // デフォルトの「シート1」を削除
  var defaultSheet = ss.getSheetByName('シート1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  Logger.log('セットアップ完了。スプレッドシートURL: ' + ss.getUrl());
  Logger.log('学生マスターシートに学生の氏名とGmailを入力してください。');
}
