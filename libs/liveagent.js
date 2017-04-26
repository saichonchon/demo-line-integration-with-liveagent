var util = require("./utilities");

var USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36";
var API_VERSION = process.env.LIVEAGENT_API_VERSION || 39;

exports.startSessionWithLine = function() {
  createLiveAgentSession(function() {
    createChatVisitorSession();
  });
};

function createLiveAgentSession(callback) {
  var liveagent = util.getLiveagentConnection();
  var request = require("request");
  var options = {
    url: "https://" + liveagent.laPod + "/chat/rest/System/SessionId",
    headers: {
      "X-LIVEAGENT-API-VERSION": API_VERSION,
      "X-LIVEAGENT-AFFINITY": "null",
      Connection: "keep-alive"
    },
    json: true
  };
  request.get(options, function(error, response, body) {
    if (error || response.statusCode != 200) {
      handleError(error, body);
      return;
    }
    util.setSession({
      key: body.key,
      affinity: body.affinityToken,
      id: body.id,
      sequence: 1
    });
    callback();
  });
}

function createChatVisitorSession() {
  var session = util.getSession();
  var liveagent = util.getLiveagentConnection();
  var line = util.getLineConnection();

  var request = require("request");
  var options = {
    url: "https://" + liveagent.laPod + "/chat/rest/Chasitor/ChasitorInit",
    headers: {
      "X-LIVEAGENT-API-VERSION": API_VERSION,
      "X-LIVEAGENT-SESSION-KEY": session.key,
      "X-LIVEAGENT-SEQUENCE": session.sequence,
      "X-LIVEAGENT-AFFINITY": session.affinity
    },
    json: true,
    body: {
      organizationId: liveagent.orgId,
      deploymentId: liveagent.deploymentId,
      buttonId: liveagent.buttonId,
      sessionId: session.id,
      trackingId: "",
      userAgent: USER_AGENT,
      language: "ja",
      screenResolution: "3200x1800",
      visitorName: line.user.displayName,
      prechatDetails: [
        {
          label: "ContactLineId",
          value: line.user.id,
          entityMaps: [],
          transcriptFields: [],
          displayToAgent: true,
          doKnowledgeSearch: false
        },
        {
          label: "ContactLastName",
          value: line.user.name,
          entityMaps: [],
          transcriptFields: [],
          displayToAgent: true,
          doKnowledgeSearch: false
        }
      ],
      buttonOverrides: [],
      receiveQueueUpdates: true,
      prechatEntities: [
        {
          entityName: "Contact",
          showOnCreate: true,
          linkToEntityName: null,
          linkToEntityField: null,
          saveToTranscript: "ContactId",
          entityFieldsMaps: [
            {
              fieldName: "LastName",
              label: "ContactLastName",
              doFind: false,
              isExactMatch: false,
              doCreate: true
            },
            {
              fieldName: "LineId__c",
              label: "ContactLineId",
              doFind: true,
              isExactMatch: true,
              doCreate: true
            }
          ]
        }
      ],
      isPost: true
    }
  };

  request.post(options, function(error, response, body) {
    if (error || response.statusCode != 200) {
      handleError(error, body);
      return;
    }
    session.sequence++;
    util.setSession(session);

    monitorChatActivity();
    util.setResponder({
      name: "LIVEAGENT", // LIVEAGENT
      status: "CONNECTED", // WAITING, DISCONNECTED
      options: {}
    });
  });
}

function monitorChatActivity() {
  var liveagent = util.getLiveagentConnection();
  var session = util.getSession();

  session.ack = session.ack === undefined ? -1 : session.ack;
  var request = require("request");
  var options = {
    url: "https://" + liveagent.laPod + "/chat/rest/System/Messages",
    qs: {
      ack: session.ack
    },
    headers: {
      "X-LIVEAGENT-API-VERSION": API_VERSION,
      "X-LIVEAGENT-SESSION-KEY": session.key,
      "X-LIVEAGENT-AFFINITY": session.affinity
    },
    json: true
  };
  request.get(options, function(error, response, body) {
    if (error || response.statusCode != 200) {
      handleError(error, body);
    } else if (!error && response.statusCode == 204) {
      monitorChatActivity();
    } else {
      session.ack = body.sequence;
      util.setSession(session);
      monitorChatActivity();
      body.messages.forEach(function(message) {
        onMessageRecieved(message);
      });
    }
  });
}

function onMessageRecieved(message) {
  var line = util.getLineConnection();
  switch (message.type) {
    case "ChatMessage":
      onChatMessage(line, message);
      break;
    case "AgentTyping":
      onAgentTyping();
      break;
    case "AgentNotTyping":
      onAgentNotTyping();
      break;
    case "AgentDisconnect":
      onAgentDisconnect();
      break;
    case "ChasitorSessionData":
      onChasitorSessionData();
      break;
    case "ChatEnded":
      onChatEnded();
      break;
    case "ChatEstablished":
      onChatEstablished();
      break;
    case "ChatRequestFail":
      onChatRequestFail();
      break;
    case "ChatRequestSuccess":
      onChatRequestSuccess();
      break;
    case "ChatTransferred":
      onChatTransferred();
      break;
    case "CustomEvent":
      onCustomEvent();
      break;
    case "NewVisitorBreadcrumb":
      onNewVisitorBreadcrumb();
      break;
    case "QueueUpdate":
      onQueueUpdate();
      break;
    case "FileTransfer":
      onFileTransfer();
      break;
    case "Availability":
      onAvailability();
      break;
    default:
      break;
  }
}

function onChatMessage(line, message) {
  util.pushMessage(line, [
    {
      type: "text",
      text: message.message.text
    }
  ]);
}

function onAgentTyping() {}
function onAgentNotTyping() {}
function onAgentDisconnect() {
  util.initSession();
  util.initRespoder();
}
function onChasitorSessionData() {}
function onChatEnded() {
  util.initSession();
  util.initRespoder();
}
function onChatEstablished() {}
function onChatRequestFail() {}
function onChatRequestSuccess() {}
function onChatTransferred() {}
function onCustomEvent() {}
function onNewVisitorBreadcrumb() {}
function onQueueUpdate() {}
function onFileTransfer() {}
function onAvailability() {}

exports.onEventRecieved = function(event) {
  var line = util.getLineConnection();
  var liveagent = util.getLiveagentConnection();
  switch (event.type) {
    case "message":
      switch (event.message.type) {
        case "text":
          sendMessage(liveagent, event.message.text);
          break;
        case "image":
          util.getContent(line, event.message, function(content) {
            uploadFile(liveagent, content);
          });

          break;
        case "video":
          util.getContent(line, event.message, function(content) {
            uploadFile(liveagent, content);
          });
          break;
        case "audio":
          util.getContent(line, event.message, function(content) {
            uploadFile(liveagent, content);
          });
          break;
        case "location":
          break;
        case "sticker":
          break;
        default:
          break;
      }
      break;
    case "follow":
      break;
    case "unfollow":
      break;
    case "join":
      break;
    case "leave":
      break;
    case "postback":
      break;
    case "beacon":
      break;
    default:
      break;
  }
};

function sendMessage(liveagent, text) {
  var session = util.getSession();
  var request = require("request");
  var options = {
    url: "https://" + liveagent.laPod + "/chat/rest/Chasitor/ChatMessage",
    headers: {
      "X-LIVEAGENT-API-VERSION": API_VERSION,
      "X-LIVEAGENT-SESSION-KEY": session.key,
      "X-LIVEAGENT-SEQUENCE": session.sequence,
      "X-LIVEAGENT-AFFINITY": session.affinity
    },
    json: true,
    body: {
      text: text
    }
  };
  request.post(options, function(error, response, body) {
    if (error || response.statusCode != 200) {
      handleError(error, body);
      return;
    }
    session.sequence++;
    util.setSession(session);
  });
}

function uploadFile(options, content) {
  var session = util.getSession();
  var request = require("request");
  var query = "?orgId=" + liveagent.laPod;
  query += "&chatKey=" + session.key.slice(session.key.indexOf("!"));
  query += "&fileToken=" + liveagent.file.fileToken;
  query += "&encoding=UTF-8";
  var options = {
    url: liveagent.file.uploadServletUrl + query,
    headers: {
      Referer: liveagent.file.cdmServletUrl,
      "User-Agent": USER_AGENT
    },
    formData: {
      filename: "test.jpg",
      file: {
        value: content.data,
        options: {
          filename: "test.jpg",
          contentType: content.type
        }
      }
    }
  };
  request.post(options, function(error, response, body) {
    if (error || response.statusCode != 200) {
      handleError(error, body);
      return;
    }
  });
}

function handleError(error, body) {
  console.log(error);
  if (body && body.details && body.details.length > 0) {
    console.error(body.message);
    body.details.forEach(function(detail) {
      console.error(detail.property + ": " + detail.message);
    });
  }
}
