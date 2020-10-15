import React, { Component, useEffect } from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import copy from "copy-to-clipboard";
import { FormattedMessage } from "react-intl";
import screenfull from "screenfull";

import configs from "../utils/configs";
import IfFeature from "./if-feature";
import { VR_DEVICE_AVAILABILITY } from "../utils/vr-caps-detect";
import { canShare } from "../utils/share";
import styles from "../assets/stylesheets/ui-root.scss";
import { ReactAudioContext } from "./wrap-with-audio";
import {
  pushHistoryState,
  clearHistoryState,
  popToBeginningOfHubHistory,
  navigateToPriorPage,
  sluglessPath
} from "../utils/history";
import StateRoute from "./state-route.js";
import { getPresenceProfileForSession, discordBridgesForPresences } from "../utils/phoenix-utils";
import { getMicrophonePresences } from "../utils/microphone-presence";
import { getCurrentStreamer } from "../utils/component-utils";

import { getMessages } from "../utils/i18n";
import AutoExitWarning from "./auto-exit-warning";
import ProfileEntryPanel from "./profile-entry-panel";
import MediaBrowser from "./media-browser";

import CreateObjectDialog from "./create-object-dialog.js";
import ChangeSceneDialog from "./change-scene-dialog.js";
import AvatarUrlDialog from "./avatar-url-dialog.js";
import InviteDialog from "./invite-dialog.js";
import InviteTeamDialog from "./invite-team-dialog.js";
import SignInDialog from "./sign-in-dialog.js";
import RoomSettingsDialog from "./room-settings-dialog.js";
import CloseRoomDialog from "./close-room-dialog.js";
import Tip from "./tip.js";
import WebRTCScreenshareUnsupportedDialog from "./webrtc-screenshare-unsupported-dialog.js";
import WebVRRecommendDialog from "./webvr-recommend-dialog.js";
import FeedbackDialog from "./feedback-dialog.js";
import HelpDialog from "./help-dialog.js";
import SafariMicDialog from "./safari-mic-dialog.js";
import LeaveRoomDialog from "./leave-room-dialog.js";
import RoomInfoDialog from "./room-info-dialog.js";
import ClientInfoDialog from "./client-info-dialog.js";
import ObjectInfoDialog from "./object-info-dialog.js";
import OAuthDialog from "./oauth-dialog.js";
import TweetDialog from "./tweet-dialog.js";
import EntryStartPanel from "./entry-start-panel.js";
import AvatarEditor from "./avatar-editor";
import PreferencesScreen from "./preferences-screen.js";
import PresenceLog from "./presence-log.js";
import ObjectList from "./object-list.js";
import PreloadOverlay from "./preload-overlay.js";
import TwoDHUD from "./2d-hud";
import { SpectatingLabel } from "./spectating-label";
import { showFullScreenIfAvailable, showFullScreenIfWasFullScreen } from "../utils/fullscreen";
import { exit2DInterstitialAndEnterVR, isIn2DInterstitial } from "../utils/vr-interstitial";
import { resetTips } from "../systems/tips";

import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import qsTruthy from "../utils/qs_truthy";
import { CAMERA_MODE_INSPECT } from "../systems/camera-system";
import { LoadingScreenContainer } from "./room/LoadingScreenContainer";

import "./styles/global.scss";
import { RoomLayout } from "./layout/RoomLayout";
import { useAccessibleOutlineStyle } from "./input/useAccessibleOutlineStyle";
import { ToolbarButton } from "./input/ToolbarButton";
import { RoomEntryModal } from "./room/RoomEntryModal";
import { EnterOnDeviceModal } from "./room/EnterOnDeviceModal";
import { MicPermissionsModal } from "./room/MicPermissionsModal";
import { MicSetupModalContainer } from "./room/MicSetupModalContainer";
import { InvitePopoverContainer } from "./room/InvitePopoverContainer";
import { MoreMenuPopoverButton, CompactMoreMenuButton, MoreMenuContextProvider } from "./room/MoreMenuPopover";
import { ChatSidebarContainer, ChatContextProvider, ChatToolbarButtonContainer } from "./room/ChatSidebarContainer";
import { ContentMenu, ContentMenuButton } from "./room/ContentMenu";
import { ReactComponent as CameraIcon } from "./icons/Camera.svg";
import { ReactComponent as AvatarIcon } from "./icons/Avatar.svg";
import { ReactComponent as SceneIcon } from "./icons/Scene.svg";
import { ReactComponent as StarOutlineIcon } from "./icons/StarOutline.svg";
import { ReactComponent as StarIcon } from "./icons/Star.svg";
import { ReactComponent as SettingsIcon } from "./icons/Settings.svg";
import { ReactComponent as WarningCircleIcon } from "./icons/WarningCircle.svg";
import { ReactComponent as HomeIcon } from "./icons/Home.svg";
import { ReactComponent as TextDocumentIcon } from "./icons/TextDocument.svg";
import { ReactComponent as SupportIcon } from "./icons/Support.svg";
import { ReactComponent as ShieldIcon } from "./icons/Shield.svg";
import { ReactComponent as DiscordIcon } from "./icons/Discord.svg";
import { ReactComponent as VRIcon } from "./icons/VR.svg";
import { ReactComponent as PeopleIcon } from "./icons/People.svg";
import { ReactComponent as ObjectsIcon } from "./icons/Objects.svg";
import { PeopleSidebarContainer, userFromPresence } from "./room/PeopleSidebarContainer";

const avatarEditorDebug = qsTruthy("avatarEditorDebug");

// This is a list of regexes that match the microphone labels of HMDs.
//
// If entering VR mode, and if any of these regexes match an audio device,
// the user will be prevented from entering VR until one of those devices is
// selected as the microphone.
//
// Note that this doesn't have to be exhaustive: if no devices match any regex
// then we rely upon the user to select the proper mic.
const HMD_MIC_REGEXES = [/\Wvive\W/i, /\Wrift\W/i];

const IN_ROOM_MODAL_ROUTER_PATHS = ["/media"];
const IN_ROOM_MODAL_QUERY_VARS = ["media_source"];

const LOBBY_MODAL_ROUTER_PATHS = ["/media/scenes", "/media/avatars", "/media/favorites"];
const LOBBY_MODAL_QUERY_VARS = ["media_source"];
const LOBBY_MODAL_QUERY_VALUES = ["scenes", "avatars", "favorites"];

async function grantedMicLabels() {
  const mediaDevices = await navigator.mediaDevices.enumerateDevices();
  return mediaDevices.filter(d => d.label && d.kind === "audioinput").map(d => d.label);
}

const isMobile = AFRAME.utils.device.isMobile();
const isMobileVR = AFRAME.utils.device.isMobileVR();
const isFirefoxReality = isMobileVR && navigator.userAgent.match(/Firefox/);

const AUTO_EXIT_TIMER_SECONDS = 10;

class UIRoot extends Component {
  willCompileAndUploadMaterials = false;

  static propTypes = {
    enterScene: PropTypes.func,
    exitScene: PropTypes.func,
    onSendMessage: PropTypes.func,
    disableAutoExitOnIdle: PropTypes.bool,
    forcedVREntryType: PropTypes.string,
    isBotMode: PropTypes.bool,
    store: PropTypes.object,
    mediaSearchStore: PropTypes.object,
    scene: PropTypes.object,
    authChannel: PropTypes.object,
    hubChannel: PropTypes.object,
    linkChannel: PropTypes.object,
    hub: PropTypes.object,
    availableVREntryTypes: PropTypes.object,
    checkingForDeviceAvailability: PropTypes.bool,
    environmentSceneLoaded: PropTypes.bool,
    entryDisallowed: PropTypes.bool,
    roomUnavailableReason: PropTypes.string,
    hubIsBound: PropTypes.bool,
    isSupportAvailable: PropTypes.bool,
    presenceLogEntries: PropTypes.array,
    presences: PropTypes.object,
    sessionId: PropTypes.string,
    subscriptions: PropTypes.object,
    initialIsSubscribed: PropTypes.bool,
    initialIsFavorited: PropTypes.bool,
    showSignInDialog: PropTypes.bool,
    signInMessageId: PropTypes.string,
    signInCompleteMessageId: PropTypes.string,
    signInContinueTextId: PropTypes.string,
    onContinueAfterSignIn: PropTypes.func,
    showSafariMicDialog: PropTypes.bool,
    showOAuthDialog: PropTypes.bool,
    onCloseOAuthDialog: PropTypes.func,
    oauthInfo: PropTypes.array,
    isCursorHoldingPen: PropTypes.bool,
    hasActiveCamera: PropTypes.bool,
    onMediaSearchResultEntrySelected: PropTypes.func,
    onAvatarSaved: PropTypes.func,
    activeTips: PropTypes.object,
    location: PropTypes.object,
    history: PropTypes.object,
    showInterstitialPrompt: PropTypes.bool,
    onInterstitialPromptClicked: PropTypes.func,
    performConditionalSignIn: PropTypes.func,
    hide: PropTypes.bool,
    showPreload: PropTypes.bool,
    onPreloadLoadClicked: PropTypes.func,
    embed: PropTypes.bool,
    embedToken: PropTypes.string,
    onLoaded: PropTypes.func
  };

  state = {
    enterInVR: false,
    entered: false,
    entering: false,
    dialog: null,
    showShareDialog: false,
    broadcastTipDismissed: false,
    linkCode: null,
    linkCodeCancel: null,
    miniInviteActivated: false,

    didConnectToNetworkedScene: false,
    noMoreLoadingUpdates: false,
    hideLoader: false,
    showPrefs: false,
    watching: false,
    isStreaming: false,
    showStreamingTip: false,

    waitingOnAudio: false,
    mediaStream: null,
    audioTrack: null,
    audioTrackClone: null,
    micDevices: [],

    autoExitTimerStartedAt: null,
    autoExitTimerInterval: null,
    autoExitMessage: null,
    secondsRemainingBeforeAutoExit: Infinity,

    muted: false,
    frozen: false,

    exited: false,

    signedIn: false,
    videoShareMediaSource: null,
    showVideoShareFailed: false,

    objectInfo: null,
    objectSrc: "",
    sidebarId: null
  };

  constructor(props) {
    super(props);

    if (props.showSafariMicDialog) {
      this.state.dialog = <SafariMicDialog closable={false} />;
    }

    props.mediaSearchStore.setHistory(props.history);

    // An exit handler that discards event arguments and can be cleaned up.
    this.exitEventHandler = () => this.exit();
  }

  componentDidUpdate(prevProps) {
    const { hubChannel, showSignInDialog } = this.props;
    if (hubChannel) {
      const { signedIn } = hubChannel;
      if (signedIn !== this.state.signedIn) {
        this.setState({ signedIn });
      }
    }
    if (prevProps.showSignInDialog !== showSignInDialog) {
      if (showSignInDialog) {
        this.showContextualSignInDialog();
      } else {
        this.closeDialog();
      }
    }
    if (!this.willCompileAndUploadMaterials && this.state.noMoreLoadingUpdates) {
      this.willCompileAndUploadMaterials = true;
      // We want to ensure that react and the browser have had the chance to render / update.
      // See https://stackoverflow.com/a/34999925 , although our solution flipped setTimeout and requestAnimationFrame
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          if (!this.props.isBotMode) {
            try {
              this.props.scene.renderer.compileAndUploadMaterials(this.props.scene.object3D, this.props.scene.camera);
            } catch {
              this.exit("scene_error"); // https://github.com/mozilla/hubs/issues/1950
            }
          }

          if (!this.state.hideLoader) {
            this.setState({ hideLoader: true });
          }
        }, 0);
      });
    }
  }

  onConcurrentLoad = () => {
    if (qsTruthy("allow_multi") || this.props.store.state.preferences["allowMultipleHubsInstances"]) return;
    this.startAutoExitTimer("autoexit.concurrent_subtitle");
  };

  onIdleDetected = () => {
    if (
      this.props.disableAutoExitOnIdle ||
      this.state.isStreaming ||
      this.props.store.state.preferences["disableIdleDetection"]
    )
      return;
    this.startAutoExitTimer("autoexit.idle_subtitle");
  };

  onActivityDetected = () => {
    if (this.state.autoExitTimerInterval) {
      this.endAutoExitTimer();
    }
  };

  componentDidMount() {
    window.addEventListener("concurrentload", this.onConcurrentLoad);
    window.addEventListener("idle_detected", this.onIdleDetected);
    window.addEventListener("activity_detected", this.onActivityDetected);
    document.querySelector(".a-canvas").addEventListener("mouseup", () => {
      if (this.state.showShareDialog) {
        this.setState({ showShareDialog: false });
      }
    });

    this.props.scene.addEventListener("loaded", this.onSceneLoaded);
    this.props.scene.addEventListener("stateadded", this.onAframeStateChanged);
    this.props.scene.addEventListener("stateremoved", this.onAframeStateChanged);
    this.props.scene.addEventListener("share_video_enabled", this.onShareVideoEnabled);
    this.props.scene.addEventListener("share_video_disabled", this.onShareVideoDisabled);
    this.props.scene.addEventListener("share_video_failed", this.onShareVideoFailed);
    this.props.scene.addEventListener("exit", this.exitEventHandler);
    this.props.scene.addEventListener("action_exit_watch", () => {
      if (this.state.hide) {
        this.setState({ hide: false });
      } else {
        this.setState({ watching: false });
      }
    });
    this.props.scene.addEventListener("action_toggle_ui", () => this.setState({ hide: !this.state.hide }));

    const scene = this.props.scene;

    this.props.store.addEventListener("statechanged", this.onStoreChanged);

    const unsubscribe = this.props.history.listen((location, action) => {
      const state = location.state;

      // If we just hit back into the entry flow, just go back to the page before the room landing page.
      if (action === "POP" && state && state.entry_step && this.state.entered) {
        unsubscribe();
        navigateToPriorPage(this.props.history);
        return;
      }
    });

    // If we refreshed the page with any state history (eg if we were in the entry flow
    // or had a modal/overlay open) just reset everything to the beginning of the flow by
    // erasing all history that was accumulated for this room (including across refreshes.)
    //
    // We don't do this for the media browser case, since we want to be able to share
    // links to the browser pages
    if (this.props.history.location.state && !sluglessPath(this.props.history.location).startsWith("/media")) {
      popToBeginningOfHubHistory(this.props.history);
    }

    this.setState({
      audioContext: {
        playSound: sound => {
          scene.emit(sound);
        },
        onMouseLeave: () => {
          //          scene.emit("play_sound-hud_mouse_leave");
        }
      }
    });

    if (this.props.forcedVREntryType && this.props.forcedVREntryType.endsWith("_now")) {
      this.props.scene.addEventListener(
        "loading_finished",
        () => {
          setTimeout(() => this.handleForceEntry(), 1000);
        },
        { once: true }
      );
    }

    this.playerRig = scene.querySelector("#avatar-rig");
  }

  UNSAFE_componentWillMount() {
    this.props.store.addEventListener("statechanged", this.storeUpdated);
  }

  componentWillUnmount() {
    this.props.scene.removeEventListener("loaded", this.onSceneLoaded);
    this.props.scene.removeEventListener("exit", this.exitEventHandler);
    this.props.scene.removeEventListener("share_video_enabled", this.onShareVideoEnabled);
    this.props.scene.removeEventListener("share_video_disabled", this.onShareVideoDisabled);
    this.props.scene.removeEventListener("share_video_failed", this.onShareVideoFailed);
    this.props.store.removeEventListener("statechanged", this.storeUpdated);
  }

  storeUpdated = () => {
    this.forceUpdate();
  };

  showContextualSignInDialog = () => {
    const {
      signInMessageId,
      authChannel,
      signInCompleteMessageId,
      signInContinueTextId,
      onContinueAfterSignIn
    } = this.props;

    this.showNonHistoriedDialog(SignInDialog, {
      message: getMessages()[signInMessageId],
      onSignIn: async email => {
        const { authComplete } = await authChannel.startAuthentication(email, this.props.hubChannel);

        this.showNonHistoriedDialog(SignInDialog, { authStarted: true, onClose: onContinueAfterSignIn });

        await authComplete;

        this.setState({ signedIn: true });
        this.showNonHistoriedDialog(SignInDialog, {
          authComplete: true,
          message: getMessages()[signInCompleteMessageId],
          continueText: getMessages()[signInContinueTextId],
          onClose: onContinueAfterSignIn,
          onContinue: onContinueAfterSignIn
        });
      },
      onClose: onContinueAfterSignIn
    });
  };

  updateSubscribedState = () => {
    const isSubscribed = this.props.subscriptions && this.props.subscriptions.isSubscribed();
    this.setState({ isSubscribed });
  };

  toggleFavorited = () => {
    this.props.performConditionalSignIn(
      () => this.props.hubChannel.signedIn,
      () => {
        const isFavorited = this.isFavorited();

        this.props.hubChannel[isFavorited ? "unfavorite" : "favorite"]();
        this.setState({ isFavorited: !isFavorited });
      },
      "favorite-room"
    );
  };

  isFavorited = () => {
    return this.state.isFavorited !== undefined ? this.state.isFavorited : this.props.initialIsFavorited;
  };

  onLoadingFinished = () => {
    this.setState({ noMoreLoadingUpdates: true });

    if (this.props.onLoaded) {
      this.props.onLoaded();
    }
  };

  onSceneLoaded = () => {
    this.setState({ sceneLoaded: true });
  };

  // TODO: we need to come up with a cleaner way to handle the shared state between aframe and react than emmitting events and setting state on the scene
  onAframeStateChanged = e => {
    if (!(e.detail === "muted" || e.detail === "frozen")) return;
    this.setState({
      [e.detail]: this.props.scene.is(e.detail)
    });
  };

  onShareVideoEnabled = e => {
    this.setState({ videoShareMediaSource: e.detail.source });
  };

  onShareVideoDisabled = () => {
    this.setState({ videoShareMediaSource: null });
  };

  onShareVideoFailed = () => {
    this.setState({ showVideoShareFailed: true });
  };

  toggleMute = () => {
    this.props.scene.emit("action_mute");
  };

  shareVideo = mediaSource => {
    this.props.scene.emit(`action_share_${mediaSource}`);
  };

  endShareVideo = () => {
    this.props.scene.emit("action_end_video_sharing");
  };

  spawnPen = () => {
    this.props.scene.emit("penButtonPressed");
  };

  onSubscribeChanged = async () => {
    if (!this.props.subscriptions) return;

    await this.props.subscriptions.toggle();
    this.updateSubscribedState();
  };

  handleForceEntry = () => {
    if (!this.props.forcedVREntryType) return;

    if (this.props.forcedVREntryType.startsWith("daydream")) {
      this.enterDaydream();
    } else if (this.props.forcedVREntryType.startsWith("vr")) {
      this.enterVR();
    } else if (this.props.forcedVREntryType.startsWith("2d")) {
      this.enter2D();
    }
  };

  startAutoExitTimer = autoExitMessage => {
    if (this.state.autoExitTimerInterval) return;

    const autoExitTimerInterval = setInterval(() => {
      let secondsRemainingBeforeAutoExit = Infinity;

      if (this.state.autoExitTimerStartedAt) {
        const secondsSinceStart = (new Date() - this.state.autoExitTimerStartedAt) / 1000;
        secondsRemainingBeforeAutoExit = Math.max(0, Math.floor(AUTO_EXIT_TIMER_SECONDS - secondsSinceStart));
      }

      this.setState({ secondsRemainingBeforeAutoExit });
      this.checkForAutoExit();
    }, 500);

    this.setState({ autoExitTimerStartedAt: new Date(), autoExitTimerInterval, autoExitMessage });
  };

  checkForAutoExit = () => {
    if (this.state.secondsRemainingBeforeAutoExit !== 0) return;
    this.endAutoExitTimer();
    this.exit();
  };

  exit = reason => {
    window.removeEventListener("concurrentload", this.onConcurrentLoad);
    window.removeEventListener("idle_detected", this.onIdleDetected);
    window.removeEventListener("activity_detected", this.onActivityDetected);

    if (this.props.exitScene) {
      this.props.exitScene(reason);
    }

    this.setState({ exited: true });
  };

  isWaitingForAutoExit = () => {
    return this.state.secondsRemainingBeforeAutoExit <= AUTO_EXIT_TIMER_SECONDS;
  };

  endAutoExitTimer = () => {
    clearInterval(this.state.autoExitTimerInterval);
    this.setState({
      autoExitTimerStartedAt: null,
      autoExitTimerInterval: null,
      autoExitMessage: null,
      secondsRemainingBeforeAutoExit: Infinity
    });
  };

  performDirectEntryFlow = async enterInVR => {
    this.setState({ enterInVR, waitingOnAudio: true });

    const hasGrantedMic = (await grantedMicLabels()).length > 0;

    if (hasGrantedMic) {
      await this.setMediaStreamToDefault();
      this.beginOrSkipAudioSetup();
    } else {
      this.onRequestMicPermission();
      this.pushHistoryState("entry_step", "mic_grant");
    }

    this.setState({ waitingOnAudio: false });
  };

  enter2D = async () => {
    await this.performDirectEntryFlow(false);
  };

  enterVR = async () => {
    if (this.props.forcedVREntryType || this.props.availableVREntryTypes.generic !== VR_DEVICE_AVAILABILITY.maybe) {
      await this.performDirectEntryFlow(true);
    } else {
      this.pushHistoryState("modal", "webvr");
    }
  };

  enterDaydream = async () => {
    await this.performDirectEntryFlow(true);
  };

  micDeviceChanged = async deviceId => {
    const constraints = { audio: { deviceId: { exact: [deviceId] } } };
    await this.fetchAudioTrack(constraints);
    await this.setupNewMediaStream();
  };

  setMediaStreamToDefault = async () => {
    let hasAudio = false;
    const { lastUsedMicDeviceId } = this.props.store.state.settings;

    // Try to fetch last used mic, if there was one.
    if (lastUsedMicDeviceId) {
      hasAudio = await this.fetchAudioTrack({ audio: { deviceId: { ideal: lastUsedMicDeviceId } } });
    } else {
      hasAudio = await this.fetchAudioTrack({ audio: {} });
    }

    await this.setupNewMediaStream();

    return { hasAudio };
  };

  fetchAudioTrack = async constraints => {
    if (this.state.audioTrack) {
      this.state.audioTrack.stop();
    }

    constraints.audio.echoCancellation =
      window.APP.store.state.preferences.disableEchoCancellation === true ? false : true;
    constraints.audio.noiseSuppression =
      window.APP.store.state.preferences.disableNoiseSuppression === true ? false : true;
    constraints.audio.autoGainControl =
      window.APP.store.state.preferences.disableAutoGainControl === true ? false : true;

    if (isFirefoxReality) {
      //workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1626081
      constraints.audio.echoCancellation =
        window.APP.store.state.preferences.disableEchoCancellation === false ? true : false;
      constraints.audio.noiseSuppression =
        window.APP.store.state.preferences.disableNoiseSuppression === false ? true : false;
      constraints.audio.autoGainControl =
        window.APP.store.state.preferences.disableAutoGainControl === false ? true : false;

      window.APP.store.update({
        preferences: {
          disableEchoCancellation: !constraints.audio.echoCancellation,
          disableNoiseSuppression: !constraints.audio.noiseSuppression,
          disableAutoGainControl: !constraints.audio.autoGainControl
        }
      });
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);

      const audioSystem = this.props.scene.systems["hubs-systems"].audioSystem;
      audioSystem.addStreamToOutboundAudio("microphone", newStream);
      const mediaStream = audioSystem.outboundStream;
      const audioTrack = newStream.getAudioTracks()[0];

      this.setState({ audioTrack, mediaStream });

      if (/Oculus/.test(navigator.userAgent)) {
        // HACK Oculus Browser 6 seems to randomly end the microphone audio stream. This re-creates it.
        // Note the ended event will only fire if some external event ends the stream, not if we call stop().
        const recreateAudioStream = async () => {
          console.warn(
            "Oculus Browser 6 bug hit: Audio stream track ended without calling stop. Recreating audio stream."
          );

          const newStream = await navigator.mediaDevices.getUserMedia(constraints);
          const audioTrack = newStream.getAudioTracks()[0];

          audioSystem.addStreamToOutboundAudio("microphone", newStream);

          this.setState({ audioTrack });

          this.props.scene.emit("local-media-stream-created");

          audioTrack.addEventListener("ended", recreateAudioStream, { once: true });
        };

        audioTrack.addEventListener("ended", recreateAudioStream, { once: true });
      }

      return true;
    } catch (e) {
      // Error fetching audio track, most likely a permission denial.
      console.error("Error during getUserMedia: ", e);
      this.setState({ audioTrack: null });
      return false;
    }
  };

  setupNewMediaStream = async () => {
    await this.fetchMicDevices();

    // we should definitely have an audioTrack at this point unless they denied mic access
    if (this.state.mediaStream) {
      const micDeviceId = this.micDeviceIdForMicLabel(this.micLabelForMediaStream(this.state.mediaStream));
      if (micDeviceId) {
        this.props.store.update({ settings: { lastUsedMicDeviceId: micDeviceId } });
      }
      this.props.scene.emit("local-media-stream-created");
    }
  };

  onRequestMicPermission = async () => {
    // TODO: Show an error state if getting the microphone permissions fails
    await this.setMediaStreamToDefault();
    this.beginOrSkipAudioSetup();
  };

  beginOrSkipAudioSetup = () => {
    const skipAudioSetup = this.props.forcedVREntryType && this.props.forcedVREntryType.endsWith("_now");

    if (skipAudioSetup) {
      this.onAudioReadyButton();
    } else {
      this.pushHistoryState("entry_step", "audio");
    }
  };

  fetchMicDevices = () => {
    return new Promise(resolve => {
      navigator.mediaDevices.enumerateDevices().then(mediaDevices => {
        this.setState(
          {
            micDevices: mediaDevices
              .filter(d => d.kind === "audioinput")
              .map(d => ({ value: d.deviceId, label: d.label }))
          },
          resolve
        );
      });
    });
  };

  shouldShowHmdMicWarning = () => {
    if (isMobile || AFRAME.utils.device.isMobileVR()) return false;
    if (!this.state.enterInVR) return false;
    if (!this.hasHmdMicrophone()) return false;

    return !HMD_MIC_REGEXES.find(r => this.selectedMicLabel().match(r));
  };

  hasHmdMicrophone = () => {
    return !!this.state.micDevices.find(d => HMD_MIC_REGEXES.find(r => d.label.match(r)));
  };

  micLabelForMediaStream = mediaStream => {
    return (mediaStream && mediaStream.getAudioTracks().length > 0 && mediaStream.getAudioTracks()[0].label) || "";
  };

  selectedMicLabel = () => {
    return this.micLabelForMediaStream(this.state.mediaStream);
  };

  micDeviceIdForMicLabel = label => {
    return this.state.micDevices.filter(d => d.label === label).map(d => d.value)[0];
  };

  selectedMicDeviceId = () => {
    return this.micDeviceIdForMicLabel(this.selectedMicLabel());
  };

  shouldShowFullScreen = () => {
    // Disable full screen on iOS, since Safari's fullscreen mode does not let you prevent native pinch-to-zoom gestures.
    return (
      (isMobile || AFRAME.utils.device.isMobileVR()) &&
      !AFRAME.utils.device.isIOS() &&
      !this.state.enterInVR &&
      screenfull.enabled
    );
  };

  onAudioReadyButton = async () => {
    if (!this.state.enterInVR) {
      await showFullScreenIfAvailable();
    }

    // Push the new history state before going into VR, otherwise menu button will take us back
    clearHistoryState(this.props.history);

    const muteOnEntry = this.props.store.state.preferences["muteMicOnEntry"] || false;
    await this.props.enterScene(this.state.mediaStream, this.state.enterInVR, muteOnEntry);

    this.setState({ entered: true, entering: false, showShareDialog: false });

    const mediaStream = this.state.mediaStream;

    if (mediaStream) {
      if (mediaStream.getAudioTracks().length > 0) {
        console.log(`Using microphone: ${mediaStream.getAudioTracks()[0].label}`);
      }

      if (mediaStream.getVideoTracks().length > 0) {
        console.log("Screen sharing enabled.");
      }
    }
  };

  attemptLink = async () => {
    this.pushHistoryState("entry_step", "device");
    const { code, cancel, onFinished } = await this.props.linkChannel.generateCode();
    this.setState({ linkCode: code, linkCodeCancel: cancel });
    onFinished.then(() => {
      this.setState({ log: false, linkCode: null, linkCodeCancel: null });
      this.exit();
    });
  };

  toggleShareDialog = async () => {
    this.props.store.update({ activity: { hasOpenedShare: true } });
    this.setState({ showShareDialog: !this.state.showShareDialog });
  };

  createObject = media => {
    this.props.scene.emit("add_media", media);
  };

  changeScene = url => {
    this.props.hubChannel.updateScene(url);
  };

  setAvatarUrl = url => {
    this.props.store.update({ profile: { ...this.props.store.state.profile, ...{ avatarId: url } } });
    this.props.scene.emit("avatar_updated");
  };

  closeDialog = () => {
    if (this.state.dialog) {
      this.setState({ dialog: null });
    } else {
      this.props.history.goBack();
    }

    if (isIn2DInterstitial()) {
      exit2DInterstitialAndEnterVR();
    } else {
      showFullScreenIfWasFullScreen();
    }
  };

  showNonHistoriedDialog = (DialogClass, props = {}) => {
    this.setState({
      dialog: <DialogClass {...{ onClose: this.closeDialog, ...props }} />
    });
  };

  toggleStreamerMode = enable => {
    this.props.scene.systems["hubs-systems"].characterController.fly = enable;

    if (enable) {
      this.props.hubChannel.beginStreaming();
      this.setState({ isStreaming: true, showStreamingTip: true });
    } else {
      this.props.hubChannel.endStreaming();
      this.setState({ isStreaming: false });
    }
  };

  renderDialog = (DialogClass, props = {}) => <DialogClass {...{ onClose: this.closeDialog, ...props }} />;

  showSignInDialog = () => {
    this.showNonHistoriedDialog(SignInDialog, {
      message: getMessages()["sign-in.prompt"],
      onSignIn: async email => {
        const { authComplete } = await this.props.authChannel.startAuthentication(email, this.props.hubChannel);

        this.showNonHistoriedDialog(SignInDialog, { authStarted: true });

        await authComplete;

        this.setState({ signedIn: true });
        this.closeDialog();
      }
    });
  };

  signOut = async () => {
    await this.props.authChannel.signOut(this.props.hubChannel);
    this.setState({ signedIn: false });
  };

  showWebRTCScreenshareUnsupportedDialog = () => {
    this.pushHistoryState("modal", "webrtc-screenshare");
  };

  onMiniInviteClicked = () => {
    const link = `https://${configs.SHORTLINK_DOMAIN}/${this.props.hub.hub_id}`;

    this.setState({ miniInviteActivated: true });
    setTimeout(() => {
      this.setState({ miniInviteActivated: false });
    }, 5000);

    if (canShare()) {
      navigator.share({ title: document.title, url: link });
    } else {
      copy(link);
    }
  };

  sendMessage = msg => {
    this.props.onSendMessage(msg);
  };

  occupantCount = () => {
    return this.props.presences ? Object.entries(this.props.presences).length : 0;
  };

  onStoreChanged = () => {
    const broadcastedRoomConfirmed = this.props.store.state.confirmedBroadcastedRooms.includes(this.props.hub.hub_id);
    if (broadcastedRoomConfirmed !== this.state.broadcastTipDismissed) {
      this.setState({ broadcastTipDismissed: broadcastedRoomConfirmed });
    }
  };

  confirmBroadcastedRoom = () => {
    this.props.store.update({ confirmedBroadcastedRooms: [this.props.hub.hub_id] });
  };

  discordBridges = () => {
    if (!this.props.presences) {
      return [];
    } else {
      return discordBridgesForPresences(this.props.presences);
    }
  };

  hasEmbedPresence = () => {
    if (!this.props.presences) {
      return false;
    } else {
      for (const p of Object.values(this.props.presences)) {
        for (const m of p.metas) {
          if (m.context && m.context.embed) {
            return true;
          }
        }
      }
    }

    return false;
  };

  pushHistoryState = (k, v) => pushHistoryState(this.props.history, k, v);

  renderInterstitialPrompt = () => {
    return (
      <div className={styles.interstitial} onClick={() => this.props.onInterstitialPromptClicked()}>
        <div>
          <FormattedMessage id="interstitial.prompt" />
        </div>
      </div>
    );
  };

  renderExitedPane = () => {
    let subtitle = null;
    if (this.props.roomUnavailableReason === "closed") {
      // TODO i18n, due to links and markup
      subtitle = (
        <div>
          Sorry, this room is no longer available.
          <p />
          <IfFeature name="show_terms">
            A room may be closed by the room owner, or if we receive reports that it violates our{" "}
            <a
              target="_blank"
              rel="noreferrer noopener"
              href={configs.link("terms_of_use", "https://github.com/mozilla/hubs/blob/master/TERMS.md")}
            >
              Terms of Use
            </a>
            .<br />
          </IfFeature>
          If you have questions, contact us at{" "}
          <a href={`mailto:${getMessages()["contact-email"]}`}>
            <FormattedMessage id="contact-email" />
          </a>
          .<p />
          <IfFeature name="show_source_link">
            If you&apos;d like to run your own server, Hubs&apos;s source code is available on{" "}
            <a href="https://github.com/mozilla/hubs">GitHub</a>
            .
          </IfFeature>
        </div>
      );
    } else {
      const reason = this.props.roomUnavailableReason;
      const tcpUrl = new URL(document.location.toString());
      const tcpParams = new URLSearchParams(tcpUrl.search);
      tcpParams.set("force_tcp", true);
      tcpUrl.search = tcpParams.toString();

      const exitSubtitleId = `exit.subtitle.${reason || "exited"}`;
      subtitle = (
        <div>
          <FormattedMessage id={exitSubtitleId} />
          <p />
          {this.props.roomUnavailableReason === "connect_error" && (
            <div>
              You can try <a href={tcpUrl.toString()}>connecting via TCP</a>, which may work better on some networks.
            </div>
          )}
          {!["left", "disconnected", "scene_error"].includes(this.props.roomUnavailableReason) && (
            <div>
              You can also <a href="/">create a new room</a>
              .
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="exited-panel">
        <img className="exited-panel__logo" src={configs.image("logo")} />
        <div className="exited-panel__subtitle">{subtitle}</div>
      </div>
    );
  };

  renderBotMode = () => {
    return (
      <div className="loading-panel">
        <img className="loading-panel__logo" src={configs.image("logo")} />
        <input type="file" id="bot-audio-input" accept="audio/*" />
        <input type="file" id="bot-data-input" accept="application/json" />
      </div>
    );
  };

  onEnteringCanceled = () => {
    this.props.hubChannel.sendEnteringCancelledEvent();
    this.setState({ entering: false });
  };

  renderEntryStartPanel = () => {
    const { hasAcceptedProfile, hasChangedName } = this.props.store.state.activity;
    const promptForNameAndAvatarBeforeEntry = this.props.hubIsBound ? !hasAcceptedProfile : !hasChangedName;

    // TODO: use appName from admin panel.
    // TODO: What does onEnteringCanceled do?
    return (
      <>
        <RoomEntryModal
          appName="Hubs by Mozilla"
          logoSrc={configs.image("logo")}
          roomName={this.props.hub.name}
          showJoinRoom={!this.state.waitingOnAudio && !this.props.entryDisallowed}
          onJoinRoom={() => {
            if (promptForNameAndAvatarBeforeEntry || !this.props.forcedVREntryType) {
              this.setState({ entering: true });
              this.props.hubChannel.sendEnteringEvent();

              if (promptForNameAndAvatarBeforeEntry) {
                this.pushHistoryState("entry_step", "profile");
              } else {
                this.onRequestMicPermission();
                this.pushHistoryState("entry_step", "mic_grant");
              }
            } else {
              this.handleForceEntry();
            }
          }}
          showEnterOnDevice={!this.state.waitingOnAudio && !this.props.entryDisallowed && !isMobileVR}
          onEnterOnDevice={() => this.attemptLink()}
          showSpectate={
            !this.state.waitingOnAudio && !this.props.entryDisallowed && configs.feature("enable_lobby_ghosts")
          }
          onSpectate={() => this.setState({ watching: true })}
          showOptions={this.props.hubChannel.canOrWillIfCreator("update_hub")}
          onOptions={() => {
            this.props.performConditionalSignIn(
              () => this.props.hubChannel.can("update_hub"),
              () => this.pushHistoryState("modal", "room_settings"),
              "room-settings"
            );
          }}
        />
        {!this.state.waitingOnAudio && (
          <EntryStartPanel
            hubChannel={this.props.hubChannel}
            entering={this.state.entering}
            onEnteringCanceled={this.onEnteringCanceled}
          />
        )}
      </>
    );
  };

  renderDevicePanel = () => {
    return (
      <EnterOnDeviceModal
        shortUrl={configs.SHORTLINK_DOMAIN}
        loadingCode={!this.state.linkCode}
        code={this.state.linkCode}
        headsetConnected={this.props.availableVREntryTypes.generic !== VR_DEVICE_AVAILABILITY.no}
        unsupportedBrowser={this.props.availableVREntryTypes.generic === VR_DEVICE_AVAILABILITY.maybe}
        onEnterOnConnectedHeadset={() => {
          // TODO: This is bad. linkCodeCancel should be tied to component lifecycle not these callback methods.
          this.state.linkCodeCancel();
          this.setState({ linkCode: null, linkCodeCancel: null });
          this.enterVR();
        }}
        onBack={() => {
          this.state.linkCodeCancel();
          this.setState({ linkCode: null, linkCodeCancel: null });
          this.props.history.goBack();
        }}
      />
    );
  };

  renderAudioSetupPanel = () => {
    const muteOnEntry = this.props.store.state.preferences["muteMicOnEntry"] || false;
    // TODO: Show HMD mic not chosen warning
    return (
      <MicSetupModalContainer
        scene={this.props.scene}
        selectedMicrophone={this.selectedMicDeviceId()}
        microphoneOptions={this.state.micDevices}
        onChangeMicrophone={this.micDeviceChanged}
        microphoneEnabled={!!this.state.audioTrack}
        microphoneMuted={muteOnEntry}
        onChangeMicrophoneMuted={() => this.props.store.update({ preferences: { muteMicOnEntry: !muteOnEntry } })}
        onEnterRoom={this.onAudioReadyButton}
        onBack={() => this.props.history.goBack()}
      />
    );
  };

  isInModalOrOverlay = () => {
    if (
      this.state.entered &&
      (IN_ROOM_MODAL_ROUTER_PATHS.find(x => sluglessPath(this.props.history.location).startsWith(x)) ||
        IN_ROOM_MODAL_QUERY_VARS.find(x => new URLSearchParams(this.props.history.location.search).get(x)))
    ) {
      return true;
    }

    if (
      !this.state.entered &&
      (LOBBY_MODAL_ROUTER_PATHS.find(x => sluglessPath(this.props.history.location).startsWith(x)) ||
        LOBBY_MODAL_QUERY_VARS.find(
          (x, i) => new URLSearchParams(this.props.history.location.search).get(x) === LOBBY_MODAL_QUERY_VALUES[i]
        ))
    ) {
      return true;
    }

    if (this.state.objectInfo && this.state.objectInfo.object3D) {
      return true; // TODO: Get object info dialog to use history
    }
    if (this.state.sidebarId !== null) {
      return true;
    }

    return !!(
      (this.props.history &&
        this.props.history.location.state &&
        (this.props.history.location.state.modal || this.props.history.location.state.overlay)) ||
      this.state.dialog
    );
  };

  getSelectedUser() {
    const selectedUserId = this.state.selectedUserId;
    const presence = this.props.presences[selectedUserId];
    const micPresences = getMicrophonePresences();
    return userFromPresence(selectedUserId, presence, micPresences, this.props.sessionId);
  }

  render() {
    const rootStyles = {
      [styles.ui]: true,
      "ui-root": true,
      "in-modal-or-overlay": this.isInModalOrOverlay(),
      isGhost: configs.feature("enable_lobby_ghosts") && (this.state.watching || (this.state.hide || this.props.hide)),
      hide: this.state.hide || this.props.hide
    };
    if (this.props.hide || this.state.hide) return <div className={classNames(rootStyles)} />;

    const isExited = this.state.exited || this.props.roomUnavailableReason;
    const preload = this.props.showPreload;

    const isLoading = !preload && !this.state.hideLoader && !this.props.showSafariMicDialog;

    if (this.props.showOAuthDialog && !this.props.showInterstitialPrompt)
      return (
        <div className={classNames(rootStyles)}>
          <OAuthDialog onClose={this.props.onCloseOAuthDialog} oauthInfo={this.props.oauthInfo} />
        </div>
      );
    if (isExited) return this.renderExitedPane();
    if (isLoading && this.state.showPrefs) {
      return (
        <div>
          <LoadingScreenContainer scene={this.props.scene} onLoaded={this.onLoadingFinished} />
          <PreferencesScreen
            onClose={() => {
              this.setState({ showPrefs: false });
            }}
            store={this.props.store}
          />
        </div>
      );
    }
    if (isLoading) {
      return <LoadingScreenContainer scene={this.props.scene} onLoaded={this.onLoadingFinished} />;
    }
    if (this.state.showPrefs) {
      return (
        <PreferencesScreen
          onClose={() => {
            this.setState({ showPrefs: false });
          }}
          store={this.props.store}
        />
      );
    }

    if (this.props.showInterstitialPrompt) return this.renderInterstitialPrompt();
    if (this.props.isBotMode) return this.renderBotMode();

    const entered = this.state.entered;
    const watching = this.state.watching;
    const enteredOrWatching = entered || watching;
    const enteredOrWatchingOrPreload = entered || watching || preload;
    const baseUrl = `${location.protocol}//${location.host}${location.pathname}`;
    const displayNameOverride = this.props.hubIsBound
      ? getPresenceProfileForSession(this.props.presences, this.props.sessionId).displayName
      : null;

    const entryDialog =
      this.props.availableVREntryTypes &&
      !preload &&
      (this.isWaitingForAutoExit() ? (
        <AutoExitWarning
          message={this.state.autoExitMessage}
          secondsRemaining={this.state.secondsRemainingBeforeAutoExit}
          onCancel={this.endAutoExitTimer}
        />
      ) : (
        <>
          <StateRoute stateKey="entry_step" stateValue="device" history={this.props.history}>
            {this.renderDevicePanel()}
          </StateRoute>
          <StateRoute stateKey="entry_step" stateValue="mic_grant" history={this.props.history}>
            <MicPermissionsModal onBack={() => this.props.history.goBack()} />
          </StateRoute>
          <StateRoute stateKey="entry_step" stateValue="audio" history={this.props.history}>
            {this.renderAudioSetupPanel()}
          </StateRoute>
          <StateRoute
            stateKey="entry_step"
            stateValue="profile"
            history={this.props.history}
            render={props => (
              <ProfileEntryPanel
                {...props}
                containerType="modal"
                displayNameOverride={displayNameOverride}
                finished={() => {
                  if (this.props.forcedVREntryType) {
                    this.pushHistoryState();
                    this.handleForceEntry();
                  } else {
                    this.onRequestMicPermission();
                    this.pushHistoryState("entry_step", "mic_grant");
                  }
                }}
                showBackButton
                onBack={() => this.pushHistoryState()}
                store={this.props.store}
                mediaSearchStore={this.props.mediaSearchStore}
                avatarId={props.location.state.detail && props.location.state.detail.avatarId}
              />
            )}
          />
          <StateRoute stateKey="entry_step" stateValue="" history={this.props.history}>
            {this.renderEntryStartPanel()}
          </StateRoute>
        </>
      ));

    const presenceLogEntries = this.props.presenceLogEntries || [];

    const switchToInspectingObject = el => {
      const src = el.components["media-loader"].data.src;
      this.setState({ objectInfo: el, objectSrc: src });
      const cameraSystem = this.props.scene.systems["hubs-systems"].cameraSystem;
      cameraSystem.uninspect();
      cameraSystem.inspect(el.object3D, el.object3D, 1.5, true);
    };

    const mediaSource = this.props.mediaSearchStore.getUrlMediaSource(this.props.history.location);

    // Allow scene picker pre-entry, otherwise wait until entry
    const showMediaBrowser =
      mediaSource && (["scenes", "avatars", "favorites"].includes(mediaSource) || this.state.entered);

    const showObjectInfo = !!(this.state.objectInfo && this.state.objectInfo.object3D);

    const discordBridges = this.discordBridges();
    const discordSnippet = discordBridges.map(ch => "#" + ch).join(", ");
    const hasEmbedPresence = this.hasEmbedPresence();
    const hasDiscordBridges = discordBridges.length > 0;
    const showBroadcastTip =
      (hasDiscordBridges || (hasEmbedPresence && !this.props.embed)) && !this.state.broadcastTipDismissed;

    const streaming = this.state.isStreaming;

    const showTopHud = enteredOrWatching && !showObjectInfo;
    const showObjectList = enteredOrWatching && !showObjectInfo;
    const showPresenceList = !showObjectInfo;

    const streamingTip = streaming &&
      this.state.showStreamingTip && (
        <div className={classNames([styles.streamingTip])}>
          <div className={classNames([styles.streamingTipAttachPoint])} />
          <button
            title="Dismiss"
            className={styles.streamingTipClose}
            onClick={() => this.setState({ showStreamingTip: false })}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>

          <div className={styles.streamingTipMessage}>
            <FormattedMessage id="tips.streaming" />
          </div>
        </div>
      );

    const streamer = getCurrentStreamer();
    const streamerName = streamer && streamer.displayName;

    const renderEntryFlow = (!enteredOrWatching && !showObjectInfo && this.props.hub) || this.isWaitingForAutoExit();

    const canCreateRoom = !configs.feature("disable_room_creation") || configs.isAdmin;
    const canUpdateRoom = this.props.hubChannel.canOrWillIfCreator("update_hub");
    const canCloseRoom = !!this.props.hubChannel.canOrWillIfCreator("close_hub");
    const roomHasSceneInfo = !!(this.props.hub && this.props.hub.scene);
    const isModerator = this.props.hubChannel.canOrWillIfCreator("kick_users") && !isMobileVR;

    const moreMenu = [
      {
        id: "user",
        label: "You",
        items: [
          canCreateRoom && {
            id: "create-room",
            label: "Create Room",
            icon: HomeIcon,
            onClick: () =>
              this.showNonHistoriedDialog(LeaveRoomDialog, {
                destinationUrl: "/",
                messageType: "create-room"
              })
          },
          {
            id: "user-profile",
            label: "Change Name & Avatar",
            icon: AvatarIcon,
            onClick: () => this.setState({ sidebarId: "profile" })
          },
          {
            id: "favorite-rooms",
            label: "Favorite Rooms",
            icon: HomeIcon, // TODO: Use a unique icon
            onClick: () =>
              this.props.performConditionalSignIn(
                () => this.props.hubChannel.signedIn,
                () => {
                  showFullScreenIfAvailable();
                  this.props.mediaSearchStore.sourceNavigateWithNoNav("favorites", "use");
                },
                "favorite-rooms"
              )
          },
          {
            id: "preferences",
            label: "Preferences",
            icon: SettingsIcon,
            onClick: () => this.setState({ showPrefs: true })
          }
        ].filter(item => item)
      },
      {
        id: "room",
        label: "Room",
        items: [
          roomHasSceneInfo && {
            id: "room-info",
            label: "Room Info",
            icon: HomeIcon,
            onClick: () => this.pushHistoryState("modal", "room_info")
          },
          canUpdateRoom && {
            id: "room-settings",
            label: "Room Settings",
            icon: HomeIcon,
            onClick: () =>
              this.props.performConditionalSignIn(
                () => this.props.hubChannel.can("update_hub"),
                () => {
                  this.pushHistoryState("modal", "room_settings");
                },
                "room-settings"
              )
          },
          canUpdateRoom && {
            id: "change-scene",
            label: "Change Scene",
            icon: SceneIcon,
            onClick: () =>
              this.props.performConditionalSignIn(
                () => this.props.hubChannel.can("update_hub"),
                () => {
                  showFullScreenIfAvailable();
                  this.props.mediaSearchStore.sourceNavigateWithNoNav("scenes", "use");
                },
                "change-scene"
              )
          },
          this.isFavorited()
            ? { id: "unfavorite-room", label: "Unfavorite Room", icon: StarIcon, onClick: () => this.toggleFavorited() }
            : {
                id: "favorite-room",
                label: "Favorite Room",
                icon: StarOutlineIcon,
                onClick: () => this.toggleFavorited()
              },
          isModerator && {
            id: "streamer-mode",
            label: "Enter Streamer Mode",
            icon: CameraIcon,
            onClick: () => this.toggleStreamerMode(true)
          },
          canCloseRoom && {
            id: "close-room",
            label: "Close Room",
            icon: HomeIcon,
            onClick: () =>
              this.props.performConditionalSignIn(
                () => this.props.hubChannel.can("update_hub"),
                () => {
                  this.pushHistoryState("modal", "close_room");
                },
                "close-room"
              )
          }
        ].filter(item => item)
      },
      {
        id: "support",
        label: "Support",
        items: [
          configs.feature("show_community_link") && {
            id: "community",
            label: "Community",
            icon: DiscordIcon,
            href: configs.link("community", "https://discord.gg/wHmY4nd")
          },
          configs.feature("show_feedback_ui") && {
            id: "feedback",
            label: "Leave Feedback",
            icon: SupportIcon, // TODO: Use a unique icon
            onClick: () => this.pushHistoryState("modal", "feedback")
          },
          configs.feature("show_issue_report_link") && {
            id: "report-issue",
            label: "Report Issue",
            icon: WarningCircleIcon,
            href: configs.link("issue_report", "https://hubs.mozilla.com/docs/help.html")
          },
          entered && {
            id: "start-tour",
            label: "Start Tour",
            icon: SupportIcon,
            onClick: () => resetTips()
          },
          configs.feature("show_docs_link") && {
            id: "help",
            label: "Help",
            icon: SupportIcon,
            href: configs.link("docs", "https://hubs.mozilla.com/docs")
          },
          configs.feature("show_controls_link") && {
            id: "controls",
            label: "Controls",
            icon: SupportIcon,
            href: configs.link("controls", "https://hubs.mozilla.com/docs/hubs-controls.html")
          },
          configs.feature("show_whats_new_link") && {
            id: "whats-new",
            label: "What's New",
            icon: SupportIcon,
            href: "/whats-new"
          },
          configs.feature("show_terms") && {
            id: "tos",
            label: "Terms of Service",
            icon: TextDocumentIcon,
            href: configs.link("terms_of_use", "https://github.com/mozilla/hubs/blob/master/TERMS.md")
          },
          configs.feature("show_privacy") && {
            id: "privacy",
            label: "Privacy Notice",
            icon: ShieldIcon,
            href: configs.link("privacy_notice", "https://github.com/mozilla/hubs/blob/master/PRIVACY.md")
          }
        ].filter(item => item)
      }
    ];

    return (
      <MoreMenuContextProvider>
        <ReactAudioContext.Provider value={this.state.audioContext}>
          <div className={classNames(rootStyles)}>
            {this.state.dialog}
            {preload &&
              this.props.hub && (
                <PreloadOverlay
                  hubName={this.props.hub.name}
                  hubScene={this.props.hub.scene}
                  baseUrl={baseUrl}
                  onLoadClicked={this.props.onPreloadLoadClicked}
                />
              )}
            <StateRoute
              stateKey="overlay"
              stateValue="avatar-editor"
              history={this.props.history}
              render={props => (
                <AvatarEditor
                  className={styles.avatarEditor}
                  signedIn={this.state.signedIn}
                  onSignIn={this.showSignInDialog}
                  onSave={() => {
                    if (props.location.state.detail && props.location.state.detail.returnToProfile) {
                      this.props.history.goBack();
                    } else {
                      this.props.history.goBack();
                      // We are returning to the media browser. Trigger an update so that the filter switches to
                      // my-avatars, now that we've saved an avatar.
                      this.props.mediaSearchStore.sourceNavigateWithNoNav("avatars", "use");
                    }
                    this.props.onAvatarSaved();
                  }}
                  onClose={() => this.props.history.goBack()}
                  store={this.props.store}
                  debug={avatarEditorDebug}
                  avatarId={props.location.state.detail && props.location.state.detail.avatarId}
                  hideDelete={props.location.state.detail && props.location.state.detail.hideDelete}
                />
              )}
            />
            {showMediaBrowser && (
              <MediaBrowser
                history={this.props.history}
                mediaSearchStore={this.props.mediaSearchStore}
                hubChannel={this.props.hubChannel}
                onMediaSearchResultEntrySelected={(entry, selectAction) => {
                  if (entry.type === "room") {
                    this.showNonHistoriedDialog(LeaveRoomDialog, {
                      destinationUrl: entry.url,
                      messageType: "join-room"
                    });
                  } else {
                    this.props.onMediaSearchResultEntrySelected(entry, selectAction);
                  }
                }}
                performConditionalSignIn={this.props.performConditionalSignIn}
              />
            )}
            <RoomLayout
              viewport={
                <>
                  <CompactMoreMenuButton />
                  <ContentMenu>
                    {showObjectList && (
                      <ContentMenuButton
                        active={this.state.sidebarId === "objects"}
                        onClick={() =>
                          this.setState(({ sidebarId }) => ({
                            sidebarId: sidebarId === "objects" ? null : "objects"
                          }))
                        }
                      >
                        <ObjectsIcon />
                        <span>Objects</span>
                      </ContentMenuButton>
                    )}
                    {showPresenceList && (
                      <ContentMenuButton
                        active={this.state.sidebarId === "people"}
                        onClick={() =>
                          this.setState(({ sidebarId }) => ({
                            sidebarId: sidebarId === "people" ? null : "people"
                          }))
                        }
                      >
                        <PeopleIcon />
                        <span>People</span>
                      </ContentMenuButton>
                    )}
                  </ContentMenu>
                  <StateRoute
                    stateKey="modal"
                    stateValue="room_settings"
                    history={this.props.history}
                    render={() =>
                      this.renderDialog(RoomSettingsDialog, {
                        showPublicRoomSetting: this.props.hubChannel.can("update_hub_promotion"),
                        initialSettings: {
                          name: this.props.hub.name,
                          description: this.props.hub.description,
                          member_permissions: this.props.hub.member_permissions,
                          room_size: this.props.hub.room_size,
                          allow_promotion: this.props.hub.allow_promotion,
                          entry_mode: this.props.hub.entry_mode
                        },
                        onChange: settings => this.props.hubChannel.updateHub(settings),
                        hubChannel: this.props.hubChannel
                      })
                    }
                  />
                  <StateRoute
                    stateKey="modal"
                    stateValue="close_room"
                    history={this.props.history}
                    render={() =>
                      this.renderDialog(CloseRoomDialog, { onConfirm: () => this.props.hubChannel.closeHub() })
                    }
                  />
                  <StateRoute
                    stateKey="modal"
                    stateValue="support"
                    history={this.props.history}
                    render={() => this.renderDialog(InviteTeamDialog, { hubChannel: this.props.hubChannel })}
                  />
                  <StateRoute
                    stateKey="modal"
                    stateValue="create"
                    history={this.props.history}
                    render={() => this.renderDialog(CreateObjectDialog, { onCreate: this.createObject })}
                  />
                  <StateRoute
                    stateKey="modal"
                    stateValue="change_scene"
                    history={this.props.history}
                    render={() => this.renderDialog(ChangeSceneDialog, { onChange: this.changeScene })}
                  />
                  <StateRoute
                    stateKey="modal"
                    stateValue="avatar_url"
                    history={this.props.history}
                    render={() => this.renderDialog(AvatarUrlDialog, { onChange: this.setAvatarUrl })}
                  />
                  <StateRoute
                    stateKey="modal"
                    stateValue="webvr"
                    history={this.props.history}
                    render={() => this.renderDialog(WebVRRecommendDialog)}
                  />
                  <StateRoute
                    stateKey="modal"
                    stateValue="webrtc-screenshare"
                    history={this.props.history}
                    render={() => this.renderDialog(WebRTCScreenshareUnsupportedDialog)}
                  />
                  <StateRoute
                    stateKey="modal"
                    stateValue="room_info"
                    history={this.props.history}
                    render={() => {
                      return this.renderDialog(RoomInfoDialog, {
                        store: this.props.store,
                        scene: this.props.hub.scene,
                        hubName: this.props.hub.name,
                        hubDescription: this.props.hub.description
                      });
                    }}
                  />
                  <StateRoute
                    stateKey="modal"
                    stateValue="feedback"
                    history={this.props.history}
                    render={() =>
                      this.renderDialog(FeedbackDialog, {
                        history: this.props.history,
                        onClose: () => this.pushHistoryState("modal", null)
                      })
                    }
                  />
                  <StateRoute
                    stateKey="modal"
                    stateValue="help"
                    history={this.props.history}
                    render={() =>
                      this.renderDialog(HelpDialog, {
                        history: this.props.history,
                        onClose: () => this.pushHistoryState("modal", null)
                      })
                    }
                  />
                  <StateRoute
                    stateKey="modal"
                    stateValue="tweet"
                    history={this.props.history}
                    render={() =>
                      this.renderDialog(TweetDialog, { history: this.props.history, onClose: this.closeDialog })
                    }
                  />
                  {this.state.objectInfo && (
                    <ObjectInfoDialog
                      scene={this.props.scene}
                      el={this.state.objectInfo}
                      src={this.state.objectSrc}
                      pinned={this.state.objectInfo && this.state.objectInfo.components["networked"].data.persistent}
                      hubChannel={this.props.hubChannel}
                      onPinChanged={() => switchToInspectingObject(this.state.objectInfo)}
                      onNavigated={el => switchToInspectingObject(el)}
                      onClose={() => {
                        if (this.props.scene.systems["hubs-systems"].cameraSystem.mode === CAMERA_MODE_INSPECT) {
                          this.props.scene.systems["hubs-systems"].cameraSystem.uninspect();
                        }
                        this.setState({ objectInfo: null });
                      }}
                    />
                  )}
                  {this.state.sidebarId !== "chat" &&
                    this.props.hub && (
                      <PresenceLog
                        inRoom={true}
                        presences={this.props.presences}
                        entries={presenceLogEntries}
                        hubId={this.props.hub.hub_id}
                        history={this.props.history}
                        onViewProfile={sessionId => this.setState({ sidebarId: "user", selectedUserId: sessionId })}
                      />
                    )}
                  {entered &&
                    this.props.activeTips &&
                    this.props.activeTips.bottom &&
                    (!presenceLogEntries || presenceLogEntries.length === 0) &&
                    !showBroadcastTip && (
                      <Tip
                        tip={this.props.activeTips.bottom}
                        tipRegion="bottom"
                        pushHistoryState={this.pushHistoryState}
                      />
                    )}
                  {enteredOrWatchingOrPreload &&
                    showBroadcastTip && (
                      <Tip
                        tip={hasDiscordBridges ? "discord" : "embed"}
                        broadcastTarget={discordSnippet}
                        onClose={() => this.confirmBroadcastedRoom()}
                      />
                    )}
                  {this.state.frozen && (
                    <button className={styles.leaveButton} onClick={() => this.exit("left")}>
                      <FormattedMessage id="entry.leave-room" />
                    </button>
                  )}
                  <StateRoute
                    stateKey="overlay"
                    stateValue="invite"
                    history={this.props.history}
                    render={() => (
                      <InviteDialog
                        allowShare={!!navigator.share}
                        entryCode={this.props.hub.entry_code}
                        hubId={this.props.hub.hub_id}
                        isModal={true}
                        onClose={() => {
                          this.props.history.goBack();
                          exit2DInterstitialAndEnterVR();
                        }}
                      />
                    )}
                  />
                  {streaming && (
                    <button
                      title="Exit Streamer Mode"
                      onClick={() => this.toggleStreamerMode(false)}
                      className={classNames([styles.cornerButton, styles.cameraModeExitButton])}
                    >
                      <FontAwesomeIcon icon={faTimes} />
                    </button>
                  )}
                  {streamingTip}
                  {!entered && !streaming && !isMobile && streamerName && <SpectatingLabel name={streamerName} />}
                  {showTopHud && (
                    <div className={styles.topHud}>
                      <TwoDHUD.TopHUD
                        scene={this.props.scene}
                        history={this.props.history}
                        mediaSearchStore={this.props.mediaSearchStore}
                        muted={this.state.muted}
                        frozen={this.state.frozen}
                        watching={this.state.watching}
                        onWatchEnded={() => this.setState({ watching: false })}
                        videoShareMediaSource={this.state.videoShareMediaSource}
                        showVideoShareFailed={this.state.showVideoShareFailed}
                        hideVideoShareFailedTip={() => this.setState({ showVideoShareFailed: false })}
                        activeTip={this.props.activeTips && this.props.activeTips.top}
                        isCursorHoldingPen={this.props.isCursorHoldingPen}
                        hasActiveCamera={this.props.hasActiveCamera}
                        onToggleMute={this.toggleMute}
                        onSpawnPen={this.spawnPen}
                        onSpawnCamera={() => this.props.scene.emit("action_toggle_camera")}
                        onShareVideo={this.shareVideo}
                        onEndShareVideo={this.endShareVideo}
                        onShareVideoNotCapable={() => this.showWebRTCScreenshareUnsupportedDialog()}
                        isStreaming={streaming}
                        showStreamingTip={this.state.showStreamingTip}
                        hideStreamingTip={() => {
                          this.setState({ showStreamingTip: false });
                        }}
                      />
                    </div>
                  )}
                </>
              }
              sidebar={
                this.state.sidebarId ? (
                  <>
                    {this.state.sidebarId === "chat" && (
                      <ChatSidebarContainer
                        occupantCount={this.occupantCount()}
                        discordBridges={discordBridges}
                        canSpawnMessages={entered && this.props.hubChannel.can("spawn_and_move_media")}
                        onUploadFile={this.createObject}
                        onClose={() => this.setState({ sidebarId: null })}
                      />
                    )}
                    {this.state.sidebarId === "objects" && (
                      <ObjectList
                        scene={this.props.scene}
                        onInspectObject={el => switchToInspectingObject(el)}
                        onUninspectObject={() => {
                          this.setState({ objectInfo: null });
                          if (this.props.scene.systems["hubs-systems"].cameraSystem.mode === CAMERA_MODE_INSPECT) {
                            this.props.scene.systems["hubs-systems"].cameraSystem.uninspect();
                          }
                        }}
                      />
                    )}
                    {this.state.sidebarId === "people" && (
                      <PeopleSidebarContainer
                        displayNameOverride={displayNameOverride}
                        store={this.props.store}
                        mediaSearchStore={this.props.mediaSearchStore}
                        hubChannel={this.props.hubChannel}
                        history={this.props.history}
                        mySessionId={this.props.sessionId}
                        presences={this.props.presences}
                        onClose={() => this.setState({ sidebarId: null })}
                        showNonHistoriedDialog={this.showNonHistoriedDialog}
                        performConditionalSignIn={this.props.performConditionalSignIn}
                      />
                    )}
                    {this.state.sidebarId === "profile" && (
                      <ProfileEntryPanel
                        history={this.props.history}
                        containerType="sidebar"
                        displayNameOverride={displayNameOverride}
                        finished={() => this.setState({ sidebarId: null })}
                        onClose={() => this.setState({ sidebarId: null })}
                        store={this.props.store}
                        mediaSearchStore={this.props.mediaSearchStore}
                      />
                    )}
                    {this.state.sidebarId === "user" && (
                      <ClientInfoDialog
                        user={this.getSelectedUser()}
                        hubChannel={this.props.hubChannel}
                        performConditionalSignIn={this.props.performConditionalSignIn}
                        onClose={() => this.setState({ sidebarId: null, selectedUserId: null })}
                        showNonHistoriedDialog={this.showNonHistoriedDialog}
                      />
                    )}
                  </>
                ) : (
                  undefined
                )
              }
              modal={renderEntryFlow && entryDialog}
              toolbarLeft={<InvitePopoverContainer hub={this.props.hub} />}
              toolbarCenter={
                <ChatToolbarButtonContainer
                  onClick={() =>
                    this.setState(({ sidebarId }) => ({
                      sidebarId: sidebarId === "chat" ? null : "chat"
                    }))
                  }
                />
              }
              toolbarRight={
                <>
                  {entered &&
                    isMobileVR && (
                      <ToolbarButton
                        icon={<VRIcon />}
                        preset="accept"
                        label="Enter VR"
                        onClick={() => exit2DInterstitialAndEnterVR(true)}
                      />
                    )}
                  <MoreMenuPopoverButton menu={moreMenu} />
                </>
              }
            />
          </div>
        </ReactAudioContext.Provider>
      </MoreMenuContextProvider>
    );
  }
}

function UIRootHooksWrapper(props) {
  useAccessibleOutlineStyle();

  useEffect(() => {
    const el = document.getElementById("preload-overlay");
    el.classList.add("loaded");

    // Remove the preload overlay after the animation has finished.
    const timeout = setTimeout(() => {
      el.remove();
    }, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  return (
    <ChatContextProvider messageDispatch={props.messageDispatch}>
      <UIRoot {...props} />
    </ChatContextProvider>
  );
}

UIRootHooksWrapper.propTypes = {
  messageDispatch: PropTypes.object
};

export default UIRootHooksWrapper;
