import React, { Component } from "react";
import PropTypes from "prop-types";
import { injectIntl, FormattedMessage } from "react-intl";
import { generateHubName } from "../utils/name-generation";

const HUB_NAME_PATTERN = "^[A-Za-z0-9-'\":!@#$%^&*(),.?~ ]{4,64}$";

class HubCreatePanel extends Component {
  static propTypes = {
    intl: PropTypes.object,
    environments: PropTypes.array
  };

  constructor(props) {
    super(props);

    this.state = {
      name: generateHubName(),
      environmentBundleUrl: props.environments[0].bundle_url
    };
  }

  createHub = async e => {
    e.preventDefault();

    const payload = {
      hub: { name: this.state.name, default_environment_gltf_bundle_url: this.state.environmentBundleUrl }
    };

    const res = await fetch("/api/v1/hubs", {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    const hub = await res.json();
    document.location = hub.url;
  };

  isHubNameValid = () => {
    const hubAlphaPattern = "[A-Za-z0-9]{4}";
    return new RegExp(HUB_NAME_PATTERN).test(this.state.name) && new RegExp(hubAlphaPattern).test(this.state.name);
  };

  render() {
    const { formatMessage } = this.props.intl;

    if (this.props.environments.length == 0) {
      return <div />;
    }

    const environmentChoices = this.props.environments.map(e => (
      <option key={e.bundle_url} value={e.bundle_url}>
        {e.meta.title}
      </option>
    ));

    return (
      <form onSubmit={this.createHub}>
        <div className="create-panel">
          <div className="create-panel__header">
            <FormattedMessage id="home.create_header" />
          </div>
          <div className="create-panel__form">
            <div
              className="create-panel__form__left_button"
              onClick={e => {
                e.preventDefault();
                this.setState({ name: generateHubName() });
              }}
            >
              <img className="create-panel__form__rotate_button" src="../assets/images/expand_dots_icon.svg" />
            </div>
            <div className="create-panel__form__right_button" onClick={this.createHub}>
              {this.isHubNameValid() ? (
                <img
                  className="create-panel__form__submit_button"
                  src="../assets/images/hub_create_button_enabled.svg"
                />
              ) : (
                <img
                  className="create-panel__form__submit_button"
                  src="../assets/images/hub_create_button_disabled.svg"
                />
              )}
            </div>
            <input
              className="create-panel__form__name"
              value={this.state.name}
              onChange={e => this.setState({ name: e.target.value })}
              onFocus={e => e.target.select()}
              required
              pattern={HUB_NAME_PATTERN}
              title={formatMessage({ id: "home.create_name.validation_warning" })}
            />
          </div>
        </div>
      </form>
    );
  }
}

export default injectIntl(HubCreatePanel);
