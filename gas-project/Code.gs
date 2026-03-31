/**
 * 医療面接AI評価システム - メインエントリポイント
 * 計画書v2準拠
 *
 * GASプロジェクト構成:
 *   Code.gs              - WebApp doGet、メイン処理
 *   BedrockApi.gs         - AWS Bedrock API呼び出し（Claude Sonnet 4.6）、リトライ
 *   EvaluationPrompt.gs   - 評価プロンプト、知識ベース
 *   SelfEvaluation.gs     - 自己評価処理、ギャップ分析
 *   SheetOperations.gs    - Google Sheets読み書き
 *   MailService.gs        - Gmail送信
 *   Index.html            - メイン画面
 *   Stylesheet.html       - CSS
 *   JavaScript.html       - クライアントサイドJS
 */

// ============================================================
// WebAppエントリポイント
// ============================================================

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('医療面接AI評価システム')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** HTMLファイルのインクルード用 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================
// メイン評価処理
// ============================================================

/**
 * 面接テキストを評価する（フロントエンドから呼び出し）
 * @param {Object} params
 *   - transcript: 匿名化済みPlaudテキスト
 *   - level: 評価レベル (1, 2, 3)
 *   - selfEval: 自己評価データ
 *   - interviewType: 面接種別 ('real' or 'roleplay')
 *   - studentName: 学生名（プルダウンから選択）
 * @return {Object} 評価結果
 */
function evaluateInterview(params) {
  try {
    // 1. Plaudテキストを解析
    const parsed = parsePlaudTranscript(params.transcript);

    // 2. 前回の評価結果を取得（あれば）
    const previousResult = getLatestResult(params.studentName);

    // 3. 評価プロンプトを構築
    const prompt = buildEvaluationPrompt({
      parsedTranscript: parsed,
      level: params.level,
      selfEval: params.selfEval,
      interviewType: params.interviewType,
      previousResult: previousResult
    });

    // 4. Bedrock API（Claude Sonnet 4.6）を呼び出し
    const aiResponse = callBedrockWithRetry(prompt);

    // 5. レスポンスをパース
    const evaluation = parseAiResponse(aiResponse);

    // 6. ギャップ分析
    const gapAnalysis = analyzeGap(params.selfEval, evaluation, params.level);

    // 7. 結果を組み立て
    const result = {
      evaluation: evaluation,
      gapAnalysis: gapAnalysis,
      meta: {
        timestamp: new Date().toISOString(),
        studentName: params.studentName,
        level: params.level,
        interviewType: params.interviewType,
        totalDuration: parsed.totalDuration,
        utteranceCount: parsed.utterances.length
      }
    };

    // 8. Google Sheetsに保存
    saveResult(result, params.selfEval, params.transcript);

    // JSON文字列で返す（google.script.runでのネストされたオブジェクト消失を防止）
    return JSON.stringify({ success: true, data: result });

  } catch (error) {
    Logger.log('evaluateInterview error: ' + error.toString());
    Logger.log('スタックトレース: ' + (error.stack || ''));
    return JSON.stringify({ success: false, error: error.toString() });
  }
}

// ============================================================
// Plaudテキスト解析
// ============================================================

/**
 * Plaud形式テキストを構造化データに変換
 * 対応形式:
 *   形式1（旧Plaud）: 00:00:00 Speaker 1\n[テキスト]
 *   形式2（匿名化テンプレート）: 術者：[テキスト] / 患者A：[テキスト]
 */
function parsePlaudTranscript(text) {
  // 形式を自動判定
  var anonymizedRegex = /^(術者|患者[A-Z]?|Speaker\s*\d+)\s*[：:]/m;
  var timeRegex = /^(\d{2}:\d{2}:\d{2})\s+(Speaker\s+\d+)/;

  if (text.match(anonymizedRegex) && !text.match(timeRegex)) {
    return parseAnonymizedFormat(text);
  }
  return parseTimestampFormat(text);
}

/** 匿名化テンプレート形式をパース（術者：/患者A：） */
function parseAnonymizedFormat(text) {
  var lines = text.split('\n');
  var utterances = [];
  var speakerRegex = /^(術者|患者[A-Z]?)\s*[：:]\s*(.*)/;
  var currentSpeaker = null;
  var currentText = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var match = line.match(speakerRegex);

    if (match) {
      if (currentSpeaker && currentText.length > 0) {
        utterances.push({
          time: '',
          speaker: currentSpeaker,
          text: currentText.join(' ').trim()
        });
      }
      currentSpeaker = match[1];
      currentText = match[2] ? [match[2]] : [];
    } else if (line.length > 0 && currentSpeaker) {
      currentText.push(line);
    }
  }

  if (currentSpeaker && currentText.length > 0) {
    utterances.push({
      time: '',
      speaker: currentSpeaker,
      text: currentText.join(' ').trim()
    });
  }

  return buildParseResult(utterances);
}

/** 旧Plaud形式をパース（00:00:00 Speaker 1） */
function parseTimestampFormat(text) {
  var lines = text.split('\n');
  var utterances = [];
  var currentSpeaker = null;
  var currentTime = null;
  var currentText = [];
  var timeRegex = /^(\d{2}:\d{2}:\d{2})\s+(Speaker\s+\d+)/;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var match = line.match(timeRegex);

    if (match) {
      if (currentSpeaker && currentText.length > 0) {
        utterances.push({
          time: currentTime,
          speaker: currentSpeaker,
          text: currentText.join(' ').trim()
        });
      }
      currentTime = match[1];
      currentSpeaker = match[2];
      currentText = [];
    } else if (line.length > 0 && currentSpeaker) {
      currentText.push(line);
    }
  }

  if (currentSpeaker && currentText.length > 0) {
    utterances.push({
      time: currentTime,
      speaker: currentSpeaker,
      text: currentText.join(' ').trim()
    });
  }

  return buildParseResult(utterances);
}

/** パース結果を共通フォーマットで組み立て */
function buildParseResult(utterances) {
  var speakers = [];
  var speakerSet = {};
  utterances.forEach(function(u) {
    if (!speakerSet[u.speaker]) {
      speakerSet[u.speaker] = true;
      speakers.push(u.speaker);
    }
  });

  var speakerStats = {};
  speakers.forEach(function(s) {
    var speakerUtterances = utterances.filter(function(u) { return u.speaker === s; });
    var totalChars = speakerUtterances.reduce(function(sum, u) { return sum + u.text.length; }, 0);
    speakerStats[s] = {
      utteranceCount: speakerUtterances.length,
      totalChars: totalChars
    };
  });

  var totalDuration = '不明';
  if (utterances.length > 0 && utterances[utterances.length - 1].time) {
    totalDuration = utterances[utterances.length - 1].time;
  }

  return {
    utterances: utterances,
    speakers: speakers,
    speakerStats: speakerStats,
    totalDuration: totalDuration
  };
}

// ============================================================
// 学生マスター取得
// ============================================================

/**
 * 学生マスターからプルダウン用データを取得
 */
/**
 * 学生マスターからプルダウン用データを取得
 * シート構成: A列=学生番号, B列=氏名, C列=メールアドレス
 */
function getStudentList() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('学生マスター');
    if (!sheet) return [];

    var data = sheet.getDataRange().getValues();
    var students = [];
    for (var i = 1; i < data.length; i++) {
      if (data[i][1]) {
        students.push({
          studentId: data[i][0],
          name: data[i][1],
          email: data[i][2]
        });
      }
    }
    return students;
  } catch (e) {
    Logger.log('getStudentList error: ' + e.toString());
    return [];
  }
}

// ============================================================
// テスト関数
// ============================================================

/** APIキー設定確認テスト */
function testApiKeySetup() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('BEDROCK_API_KEY');
  if (!apiKey) {
    Logger.log('❌ BEDROCK_API_KEY未設定。プロジェクトの設定→スクリプトプロパティに追加してください。');
    return;
  }
  Logger.log('✅ Bedrock API Key設定済み（長さ: ' + apiKey.length + '文字）');

  try {
    var response = callBedrockWithRetry('テストです。「OK」とだけ返してください。');
    Logger.log('✅ Bedrock API接続成功: ' + response);
  } catch (e) {
    Logger.log('❌ Bedrock API接続失敗: ' + e.toString());
  }
}

/** エンドツーエンドテスト（サンプル面接で評価を実行） */
function testEvaluation() {
  var sampleText = [
    '術者：こんにちは。本日担当の術者です。お名前をフルネームで教えていただけますか？',
    '',
    '患者A：はい、患者Aです。',
    '',
    '術者：患者Aさんですね。今日はどうされましたか？',
    '',
    '患者A：3日前から右肩が痛くて腕が上がりにくいんです。',
    '',
    '術者：右肩が痛いのですね。それはお辛いですね。わかりました。お大事にしてください。'
  ].join('\n');

  var params = {
    transcript: sampleText,
    level: 2,
    selfEval: { opening: 3, communication: 3, medicalInfo: 3, interpretationModel: 2, closing: 3, structure: 3 },
    interviewType: 'roleplay',
    studentName: 'テスト太郎'
  };

  try {
    var result = evaluateInterview(params);
    Logger.log('成功: ' + result.success);
    if (result.success) {
      var eval_ = result.data.evaluation;
      Logger.log('totalScore: ' + eval_.totalScore);
      Logger.log('grade: ' + eval_.grade);
      Logger.log('strengths数: ' + (eval_.strengths ? eval_.strengths.length : 0));
      Logger.log('improvements数: ' + (eval_.improvements ? eval_.improvements.length : 0));
      Logger.log('全データ: ' + JSON.stringify(result.data).substring(0, 2000));
    } else {
      Logger.log('エラー: ' + result.error);
    }
  } catch (e) {
    Logger.log('テスト失敗: ' + e.toString());
    Logger.log('スタックトレース: ' + e.stack);
  }
}

/** スプレッドシート接続テスト */
function testSheetSetup() {
  try {
    var ss = getSpreadsheet();
    Logger.log('✅ スプレッドシート接続成功: ' + ss.getName());

    var masterSheet = ss.getSheetByName('学生マスター');
    if (masterSheet) {
      Logger.log('✅ 学生マスターシート存在');
    } else {
      Logger.log('⚠ 学生マスターシートが見つかりません。作成してください。');
    }

    var historySheet = ss.getSheetByName('評価履歴');
    if (historySheet) {
      Logger.log('✅ 評価履歴シート存在');
    } else {
      Logger.log('⚠ 評価履歴シートが見つかりません。作成してください。');
    }
  } catch (e) {
    Logger.log('❌ スプレッドシートエラー: ' + e.toString());
  }
}
