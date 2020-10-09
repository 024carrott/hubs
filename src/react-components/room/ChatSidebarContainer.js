import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import {
  ChatSidebar,
  ChatMessageGroup,
  SystemMessage,
  ChatMessageList,
  ChatInput,
  MessageAttachmentButton,
  SpawnMessageButton,
  ChatToolbarButton
} from "./ChatSidebar";
import { useMaintainScrollPosition } from "../misc/useMaintainScrollPosition";
import { spawnChatMessage } from "../chat-message";

const ChatContext = createContext({ messageGroups: [], sendMessage: () => {} });

let uniqueMessageId = 0;

const NEW_MESSAGE_GROUP_TIMEOUT = 1000 * 60;

function shouldCreateNewMessageGroup(messageGroups, newMessage, now) {
  if (messageGroups.length === 0) {
    return true;
  }

  const lastMessageGroup = messageGroups[messageGroups.length - 1];

  if (lastMessageGroup.senderSessionId !== newMessage.sessionId) {
    return true;
  }

  const lastMessage = lastMessageGroup.messages[lastMessageGroup.messages.length - 1];

  return now - lastMessage.timestamp > NEW_MESSAGE_GROUP_TIMEOUT;
}

function processChatMessage(messageGroups, newMessage) {
  const now = Date.now();
  const { name, sent, sessionId, ...messageProps } = newMessage;

  if (shouldCreateNewMessageGroup(messageGroups, newMessage, now)) {
    return [
      ...messageGroups,
      {
        id: uniqueMessageId++,
        timestamp: now,
        sent,
        sender: name,
        senderSessionId: sessionId,
        messages: [{ id: uniqueMessageId++, timestamp: now, ...messageProps }]
      }
    ];
  }

  const lastMessageGroup = messageGroups.pop();
  lastMessageGroup.messages = [
    ...lastMessageGroup.messages,
    { id: uniqueMessageId++, timestamp: now, ...messageProps }
  ];

  return [...messageGroups, { ...lastMessageGroup }];
}

// Returns the new message groups array when we receive a message.
// If the message is ignored, we return the original message group array.
// TODO: Add i18n
function updateMessageGroups(messageGroups, newMessage) {
  switch (newMessage.type) {
    case "join":
    case "entered":
    case "leave":
    case "display_name_changed":
    case "scene_changed":
    case "hub_name_changed":
    case "log":
      return [
        ...messageGroups,
        {
          id: uniqueMessageId++,
          systemMessage: true,
          timestamp: Date.now(),
          ...newMessage
        }
      ];
    case "chat":
    case "image":
    case "photo":
    case "video":
      return processChatMessage(messageGroups, newMessage);
    default:
      return messageGroups;
  }
}

export function ChatContextProvider({ messageDispatch, children }) {
  const [messageGroups, setMessageGroups] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(false);

  useEffect(
    () => {
      function onReceiveMessage(event) {
        const newMessage = event.detail;
        setMessageGroups(messages => updateMessageGroups(messages, newMessage));

        if (
          newMessage.type === "chat" ||
          newMessage.type === "image" ||
          newMessage.type === "photo" ||
          newMessage.type === "video"
        ) {
          setUnreadMessages(true);
        }
      }

      if (messageDispatch) {
        messageDispatch.addEventListener("message", onReceiveMessage);
      }

      return () => {
        if (messageDispatch) {
          messageDispatch.removeEventListener("message", onReceiveMessage);
        }
      };
    },
    [messageDispatch, setMessageGroups, setUnreadMessages]
  );

  const sendMessage = useCallback(
    message => {
      if (messageDispatch) {
        messageDispatch.dispatch(message);
      }
    },
    [messageDispatch]
  );

  const setMessagesRead = useCallback(
    () => {
      setUnreadMessages(false);
    },
    [setUnreadMessages]
  );

  return (
    <ChatContext.Provider value={{ messageGroups, unreadMessages, sendMessage, setMessagesRead }}>
      {children}
    </ChatContext.Provider>
  );
}

ChatContextProvider.propTypes = {
  children: PropTypes.node,
  messageDispatch: PropTypes.object
};

export function ChatSidebarContainer({ canSpawnMessages, onUploadFile, discordBridges, occupantCount, onClose }) {
  const { messageGroups, sendMessage, setMessagesRead } = useContext(ChatContext);
  const [onScrollList, listRef, scrolledToBottom] = useMaintainScrollPosition(messageGroups);
  const [message, setMessage] = useState("");
  const onKeyDown = useCallback(
    e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(e.target.value);
        setMessage("");
      }
    },
    [sendMessage, setMessage]
  );
  const onSpawnMessage = () => {
    spawnChatMessage(message);
    setMessage("");
  };

  const onUploadAttachments = e => {
    // TODO: Right now there's no way to upload files to the chat only.
    // When we add the place menu whcih will have an explicit button for uploading files,
    // should we make this attach button only upload to chat?
    for (const file of e.target.files) {
      onUploadFile(file);
    }
  };

  useEffect(
    () => {
      if (scrolledToBottom) {
        setMessagesRead();
      }
    },
    [messageGroups, scrolledToBottom, setMessagesRead]
  );

  // TODO: Add i18n for this placeholder
  const discordSnippet = discordBridges.map(ch => "#" + ch).join(", ");
  const occupantSnippet = `${occupantCount - 1} other${occupantCount > 2 ? "s" : ""}`;
  const placeholder =
    occupantCount <= 1
      ? "Nobody is here yet..."
      : discordBridges.length
        ? `Send message to ${occupantSnippet} and ${discordSnippet}...`
        : `Send message to ${occupantSnippet}...`;

  return (
    <ChatSidebar onClose={onClose}>
      <ChatMessageList ref={listRef} onScroll={onScrollList}>
        {messageGroups.map(({ id, systemMessage, ...rest }) => {
          if (systemMessage) {
            return <SystemMessage key={id} {...rest} />;
          } else {
            return <ChatMessageGroup key={id} {...rest} />;
          }
        })}
      </ChatMessageList>
      <ChatInput
        id="chat-input"
        onKeyDown={onKeyDown}
        onChange={e => setMessage(e.target.value)}
        placeholder={placeholder}
        value={message}
        afterInput={
          canSpawnMessages && (
            <>
              <MessageAttachmentButton onChange={onUploadAttachments} />
              <SpawnMessageButton onClick={onSpawnMessage} />
            </>
          )
        }
      />
    </ChatSidebar>
  );
}

ChatSidebarContainer.propTypes = {
  canSpawnMessages: PropTypes.bool,
  discordBridges: PropTypes.array.isRequired,
  occupantCount: PropTypes.number.isRequired,
  onUploadFile: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
};

export function ChatToolbarButtonContainer(props) {
  const { unreadMessages } = useContext(ChatContext);
  return <ChatToolbarButton {...props} statusColor={unreadMessages ? "orange" : undefined} />;
}
