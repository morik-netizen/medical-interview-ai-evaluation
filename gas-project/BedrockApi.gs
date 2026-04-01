/**
 * AWS Bedrock API呼び出し（Claude Sonnet 4.6）
 * Converse API + 長期APIキー認証
 */

var BEDROCK_CONFIG = {
  MODEL_ID: 'global.anthropic.claude-sonnet-4-6',
  REGION: 'ap-northeast-1',
  MAX_OUTPUT_TOKENS: 16384,
  // Claude Sonnet 4.6 Bedrock pricing (USD per 1M tokens)
  INPUT_PRICE_PER_M: 3.00,
  OUTPUT_PRICE_PER_M: 15.00,
  USD_TO_JPY: 150
};

/**
 * Bedrock Converse APIのエンドポイントURLを生成
 */
function getBedrockUrl() {
  return 'https://bedrock-runtime.' + BEDROCK_CONFIG.REGION +
    '.amazonaws.com/model/' + BEDROCK_CONFIG.MODEL_ID + '/converse';
}

/**
 * Bedrock APIを呼び出す（リトライ付き）
 * @param {string} prompt - プロンプト全文
 * @param {number} maxRetries - 最大リトライ回数
 * @return {string} AIのレスポンステキスト
 */
function callBedrockWithRetry(prompt, maxRetries) {
  maxRetries = maxRetries || 3;

  var apiKey = PropertiesService.getScriptProperties().getProperty('BEDROCK_API_KEY');
  if (!apiKey) {
    throw new Error('BEDROCK_API_KEYが設定されていません。スクリプトプロパティに設定してください。');
  }

  var url = getBedrockUrl();

  var payload = {
    messages: [{
      role: 'user',
      content: [{ text: prompt }]
    }],
    inferenceConfig: {
      maxTokens: BEDROCK_CONFIG.MAX_OUTPUT_TOKENS
    }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  for (var i = 0; i < maxRetries; i++) {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();

    if (responseCode === 200) {
      var responseJson = JSON.parse(response.getContentText());
      if (responseJson.output && responseJson.output.message &&
          responseJson.output.message.content && responseJson.output.message.content.length > 0) {

        // トークン使用量を記録
        var usage = responseJson.usage || {};
        var latency = (responseJson.metrics && responseJson.metrics.latencyMs) || 0;
        logApiUsage(usage, latency);

        return responseJson.output.message.content[0].text;
      }
      throw new Error('Bedrock APIから有効な応答がありませんでした');
    }

    if (responseCode === 429) {
      var waitMs = 10000 * (i + 1);
      Logger.log('レート制限（429）。' + (waitMs / 1000) + '秒待機してリトライ (' + (i + 1) + '/' + maxRetries + ')');
      Utilities.sleep(waitMs);
      continue;
    }

    var errorText = response.getContentText().substring(0, 300);
    Logger.log('Bedrock APIエラー (HTTP ' + responseCode + '): ' + errorText);
    throw new Error('AIサービスでエラーが発生しました。しばらく待ってから再度お試しください。');
  }

  throw new Error('アクセスが集中しています。1分ほどお待ちいただいてから再度お試しください。');
}

// ============================================================
// API使用量トラッキング
// ============================================================

/**
 * API使用量をGoogle Sheetsに記録
 */
function logApiUsage(usage, latencyMs) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('API使用量');
    if (!sheet) {
      sheet = ss.insertSheet('API使用量');
      sheet.appendRow([
        '日時', 'モデル', '入力トークン', '出力トークン', '合計トークン',
        'コスト(USD)', 'コスト(JPY)', 'レスポンス(秒)'
      ]);
      sheet.setFrozenRows(1);
    }

    var inputTokens = usage.inputTokens || 0;
    var outputTokens = usage.outputTokens || 0;
    var totalTokens = inputTokens + outputTokens;
    var costUsd = (inputTokens / 1000000 * BEDROCK_CONFIG.INPUT_PRICE_PER_M) +
                  (outputTokens / 1000000 * BEDROCK_CONFIG.OUTPUT_PRICE_PER_M);
    var costJpy = costUsd * BEDROCK_CONFIG.USD_TO_JPY;

    sheet.appendRow([
      new Date(),
      BEDROCK_CONFIG.MODEL_ID,
      inputTokens,
      outputTokens,
      totalTokens,
      Math.round(costUsd * 10000) / 10000,
      Math.round(costJpy * 100) / 100,
      Math.round(latencyMs / 100) / 10
    ]);
  } catch (e) {
    Logger.log('API使用量記録エラー（評価自体は正常）: ' + e.toString());
  }
}

/**
 * ダッシュボード用のAPI使用量サマリーを取得
 */
function getApiUsageSummary() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('API使用量');
    if (!sheet || sheet.getLastRow() <= 1) {
      return { totalCalls: 0, totalTokens: 0, totalCostJpy: 0, thisMonth: [], history: [] };
    }

    var data = sheet.getDataRange().getValues();
    var now = new Date();
    var thisMonth = now.getMonth();
    var thisYear = now.getFullYear();

    var totalCalls = 0;
    var totalTokens = 0;
    var totalCostJpy = 0;
    var monthCalls = 0;
    var monthTokens = 0;
    var monthCostJpy = 0;
    var dailyMap = {};

    for (var i = 1; i < data.length; i++) {
      var date = new Date(data[i][0]);
      var tokens = data[i][4] || 0;
      var costJpy = data[i][6] || 0;

      totalCalls++;
      totalTokens += tokens;
      totalCostJpy += costJpy;

      if (date.getMonth() === thisMonth && date.getFullYear() === thisYear) {
        monthCalls++;
        monthTokens += tokens;
        monthCostJpy += costJpy;

        var dayKey = (date.getMonth() + 1) + '/' + date.getDate();
        if (!dailyMap[dayKey]) {
          dailyMap[dayKey] = { calls: 0, tokens: 0, costJpy: 0 };
        }
        dailyMap[dayKey].calls++;
        dailyMap[dayKey].tokens += tokens;
        dailyMap[dayKey].costJpy += costJpy;
      }
    }

    var daily = Object.keys(dailyMap).map(function(key) {
      return {
        date: key,
        calls: dailyMap[key].calls,
        tokens: dailyMap[key].tokens,
        costJpy: Math.round(dailyMap[key].costJpy * 100) / 100
      };
    });

    return {
      totalCalls: totalCalls,
      totalTokens: totalTokens,
      totalCostJpy: Math.round(totalCostJpy * 100) / 100,
      monthCalls: monthCalls,
      monthTokens: monthTokens,
      monthCostJpy: Math.round(monthCostJpy * 100) / 100,
      model: BEDROCK_CONFIG.MODEL_ID,
      daily: daily
    };
  } catch (e) {
    Logger.log('使用量サマリー取得エラー: ' + e.toString());
    return { totalCalls: 0, totalTokens: 0, totalCostJpy: 0, error: e.toString() };
  }
}

/**
 * AIのJSONレスポンスをパース
 */
function parseAiResponse(responseText) {
  try {
    var jsonStr = responseText;

    // ```json ... ``` を除去
    var jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    var parsed = JSON.parse(jsonStr.trim());

    // 数値フィールドが文字列で返される場合の補正
    if (typeof parsed.totalScore === 'string') {
      parsed.totalScore = parseInt(parsed.totalScore, 10) || 0;
    }
    if (typeof parsed.checkCount === 'string') {
      parsed.checkCount = parseInt(parsed.checkCount, 10) || 0;
    }

    // categoryScoresの数値補正
    if (parsed.categoryScores) {
      Object.keys(parsed.categoryScores).forEach(function(key) {
        var cat = parsed.categoryScores[key];
        if (typeof cat.score === 'string') cat.score = parseFloat(cat.score) || 0;
        if (typeof cat.maxScore === 'string') cat.maxScore = parseInt(cat.maxScore, 10) || 0;
      });
    }

    // dialogueAnalysisの数値補正
    if (parsed.dialogueAnalysis) {
      var da = parsed.dialogueAnalysis;
      ['practitionerUtterances', 'patientUtterances', 'openQuestionCount',
       'closedQuestionCount', 'empathyCount', 'reflectionCount',
       'summaryCount', 'facilitationCount'].forEach(function(key) {
        if (typeof da[key] === 'string') da[key] = parseInt(da[key], 10) || 0;
      });
    }

    // itemEvaluationsのスコア数値補正
    if (parsed.itemEvaluations && Array.isArray(parsed.itemEvaluations)) {
      parsed.itemEvaluations.forEach(function(item) {
        if (typeof item.score === 'string') item.score = parseFloat(item.score) || 0;
        if (typeof item.maxScore === 'string') item.maxScore = parseFloat(item.maxScore) || 0;
      });
    }

    Logger.log('AIレスポンスパース成功。totalScore=' + parsed.totalScore + ', grade=' + parsed.grade +
      ', items=' + (parsed.itemEvaluations ? parsed.itemEvaluations.length : 0));
    return parsed;
  } catch (e) {
    Logger.log('JSONパースエラー。応答: ' + responseText.substring(0, 1000));
    return {
      rawResponse: responseText,
      parseError: true
    };
  }
}
