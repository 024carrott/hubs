import React from "react";
import ReactDOM from "react-dom";
import { WrappedIntlProvider } from "./react-components/wrapped-intl-provider";
import registerTelemetry from "./telemetry";
import Store from "./storage/store";
import "./utils/theme";
import { getLocale, getMessages } from "./utils/i18n";
import { AuthContextProvider } from "./react-components/auth/AuthContext";
import { SignInModalContainer } from "./react-components/auth/SignInModalContainer";
import { PageContainer } from "./react-components/layout/PageContainer";
import configs from "./utils/configs";
import "./assets/stylesheets/globals.scss";
import { Center } from "./react-components/layout/Center";

registerTelemetry("/signin", "Hubs Sign In Page");

const store = new Store();
window.APP = { store };

function Root() {
  return (
    <WrappedIntlProvider locale={getLocale()} messages={getMessages()}>
      <AuthContextProvider store={store}>
        <PageContainer style={{ backgroundImage: configs.image("home_background", true), backgroundSize: "cover" }}>
          <Center>
            <SignInModalContainer />
          </Center>
        </PageContainer>
      </AuthContextProvider>
    </WrappedIntlProvider>
  );
}

ReactDOM.render(<Root />, document.getElementById("ui-root"));
