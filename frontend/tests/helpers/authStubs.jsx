// Заглушки для тестів входу й запрошення: віджет Turnstile та важкі дочірні компоненти сторінки AuthPage.
import React from 'react';

// Віджет «проходить» перевірку одразу після відображення; reset() запускає нову перевірку, як справжній.
export const TurnstileStub = React.forwardRef(({ onSuccess }, ref) => {
    React.useImperativeHandle(ref, () => ({ reset: () => onSuccess('captcha-token') }), [onSuccess]);
    React.useEffect(() => {
        onSuccess('captcha-token');
    }, []);
    return null;
});
TurnstileStub.displayName = 'TurnstileStub';

export const HelmetStub = () => null;

export const PassThroughStub = ({ children }) => <div>{children}</div>;
