// Заглушки для компонентів блоків у інтеграційних тестах реєстру.
// Вони показують, який саме компонент вибрано для типу, і зберігають отримані props.
import React from 'react';

export const rendered = [];
export const resetRendered = () => {
    rendered.length = 0;
};

// Заглушка блока, що відображається (BlockRenderer): кнопка перемикання меню потрібна для шапки.
export const makeBlockStub = (name) => {
    const Stub = (props) => {
        rendered.push({ name, props });
        return (
            <div data-testid={`block-${name}`} data-editor-preview={String(!!props.isEditorPreview)}>
                {props.blockData?.__label}
                <button type="button" data-testid={`toggle-${name}`} onClick={props.onMenuToggle}>
                    toggle
                </button>
            </div>
        );
    };
    Stub.displayName = `BlockStub(${name})`;
    return Stub;
};

// Заглушка панелі налаштувань блока (SettingsTab).
export const makeSettingsStub = (name) => {
    const Stub = (props) => (
        <div data-testid={`settings-${name}`} data-site-title={props.siteData?.title ?? ''}>
            <span data-testid="settings-data">{JSON.stringify(props.data)}</span>
            <button type="button" data-testid="settings-apply" onClick={() => props.onChange({ changedBy: name })}>
                apply
            </button>
            <button type="button" data-testid="settings-apply-silent" onClick={() => props.onChange({ changedBy: name }, false)}>
                apply-silent
            </button>
        </div>
    );
    Stub.displayName = `SettingsStub(${name})`;
    return Stub;
};

// Заглушка AnimationWrapper: показує, чи блок обгорнуто в анімацію і з якою конфігурацією.
export const AnimationStub = ({ children, animationConfig }) => (
    <div data-testid="animation" data-config={JSON.stringify(animationConfig ?? null)}>
        {children}
    </div>
);

// Заглушка вкладки «Вигляд» (AdvancedSettingsTab).
export const AdvancedStub = (props) => (
    <div data-testid="advanced-tab">
        <span data-testid="advanced-data">{JSON.stringify(props.data)}</span>
        <button type="button" data-testid="advanced-apply" onClick={() => props.onUpdate({ advanced: true })}>
            apply
        </button>
    </div>
);
