// frontend/src/modules/editor/blocks/Form/FormBlock.jsx
import React, { useState } from 'react';
import apiClient from '../../../../shared/api/api';
import { toast } from 'react-toastify';
import { useBlockFonts } from '../../../../shared/hooks/useBlockFonts';
import { Send, ArrowRight, ShoppingCart, Mail, Phone, Check, Star, MousePointer2, User, AtSign, Type, MessageSquare } from 'lucide-react';
import { areBlockPropsEqual } from '../../core/blockProps';

const DEFAULT_BUTTON_CONFIG = {
    text: 'Надіслати',
    styleType: 'primary',
    variant: 'solid',
    size: 'medium',
    borderRadius: 8,
    width: 'auto',
    alignment: 'center',
    icon: 'none',
    iconPosition: 'right',
    fontFamily: 'global'
};

const FormBlock = ({ blockData, siteData, isEditorPreview, style }) => {
    const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
    const [status, setStatus] = useState({ loading: false, error: '', success: '' });
    const { 
        successMessage, 
        height = 'small', 
        buttonText 
    } = blockData;
    
    const buttonConfig = {
        ...DEFAULT_BUTTON_CONFIG,
        ...((blockData && blockData.button) || {}),
        text: (blockData && blockData.button && blockData.button.text) || buttonText || DEFAULT_BUTTON_CONFIG.text
    };

    const rawRadius = buttonConfig.borderRadius;
    const safeRadius = (rawRadius !== undefined && rawRadius !== null && rawRadius !== '') 
        ? parseInt(rawRadius, 10) 
        : 8;
    const { styles: fontStyles, RenderFonts, cssVariables } = useBlockFonts({
        button: buttonConfig.fontFamily
    }, siteData);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isEditorPreview) return;
        setStatus({ loading: true, error: '', success: '' });
        try {
            await apiClient.post(`/public/form/${siteData.id}/submit`, formData);
            toast.success(successMessage || 'Дякуємо! Ваше повідомлення надіслано.');
            setStatus({ loading: false, error: '', success: '' });
            setFormData({ name: '', email: '', subject: '', message: '' });
        } catch (err) {
            setStatus({ loading: false, error: err.response?.data?.message || 'Помилка відправки.', success: '' });
        }
    };

    const accentColor = 'var(--site-accent, #3b82f6)';
    const textColor = 'var(--site-text-primary, #111827)';
    const whiteColor = '#ffffff';
    const colorVar = buttonConfig.styleType === 'secondary' ? textColor : accentColor;
    const isOutline = buttonConfig.variant === 'outline';
    const dynamicBtnStyle = {
        background: isOutline ? 'transparent' : colorVar,
        color: isOutline ? colorVar : (buttonConfig.styleType === 'secondary' && !isOutline ? whiteColor : whiteColor),
        border: isOutline ? `2px solid ${colorVar}` : '2px solid transparent',
        opacity: status.loading ? 0.7 : 1,
    };

    const sizeClasses = {
        small: 'px-5 py-2 @2xl:px-6 @2xl:py-2.5 text-sm @2xl:text-[0.95rem]',
        medium: 'px-6 py-2.5 @2xl:px-8 @2xl:py-3.5 text-sm @2xl:text-base',
        large: 'px-8 py-3 @2xl:px-12 @2xl:py-4 text-base @2xl:text-[1.15rem]'
    };
    
    const alignMap = {
        left: 'justify-start',
        center: 'justify-center',
        right: 'justify-end'
    };

    const heightClasses = { 
        small: 'min-h-auto',
        medium: 'min-h-[400px] @3xl:min-h-[500px]',
        large: 'min-h-[500px] @3xl:min-h-[700px]',
        full: 'min-h-[calc(100vh-60px)]' 
    };
    
    const scopeClass = `form-scope-${blockData?.block_id || blockData?.id || 'preview'}`;
    const btnClass = `form-btn-${blockData?.block_id || blockData?.id || 'preview'}`;
    const labelClasses = "block text-sm @2xl:text-[0.95rem] font-medium text-(--site-text-primary) mb-1.5 @2xl:mb-2.5 ml-0.5";
    const inputClasses = `
        peer w-full pl-10 @2xl:pl-12 pr-3 @2xl:pr-4 py-3 @2xl:py-3.5 
        bg-black/[0.02] dark:bg-white/[0.02] 
        border-2 border-(--site-border-color)
        text-(--site-text-primary) font-medium
        rounded-xl text-[1rem] 
        transition-all duration-300 outline-none 
        focus:bg-transparent dark:focus:bg-transparent
        focus:border-(--site-accent) focus:ring-4 focus:ring-(--site-accent)/15 
        hover:border-(--site-text-secondary)
    `;
    
    const iconClasses = "absolute left-3 @2xl:left-4 top-1/2 -translate-y-1/2 text-(--site-text-secondary) opacity-60 pointer-events-none transition-all duration-300 peer-focus:text-(--site-accent) peer-focus:opacity-100";
    const textareaIconClasses = "absolute left-3 @2xl:left-4 top-3 @2xl:top-4 text-(--site-text-secondary) opacity-60 pointer-events-none transition-all duration-300 peer-focus:text-(--site-accent) peer-focus:opacity-100";
    return (
        <div 
            className={`
                p-5 @2xl:p-8 @3xl:p-12 bg-(--site-card-bg) text-(--site-text-primary) 
                border border-(--site-border-color) shadow-xl @2xl:shadow-2xl shadow-black/5
                max-w-full @2xl:max-w-150 @3xl:max-w-175 w-full mx-auto rounded-2xl @2xl:rounded-3xl flex flex-col justify-center
                ${heightClasses[height]}
                ${scopeClass}
            `}
            style={{ 
                ...style,
                ...cssVariables 
            }}
        >
            <RenderFonts />
            <style>{`
                .${btnClass} { ${fontStyles.button || ''} }
                button.${btnClass} {
                    border-radius: ${safeRadius}px !important;
                }
                .${scopeClass} input::placeholder,
                .${scopeClass} textarea::placeholder {
                    color: var(--site-text-secondary);
                    opacity: 0.6;
                    font-weight: 400;
                }
                .${scopeClass} textarea {
                    scrollbar-width: thin;
                    scrollbar-color: var(--site-accent) transparent;
                }
                .${scopeClass} textarea::-webkit-scrollbar {
                    width: 6px;
                }
                .${scopeClass} textarea::-webkit-scrollbar-track {
                    background: transparent;
                }
                .${scopeClass} textarea::-webkit-scrollbar-thumb {
                    background-color: var(--site-accent);
                    border-radius: 10px;
                }
            `}</style>
            
            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5 @2xl:gap-7">
                {status.error && (
                    <div className="p-3 @2xl:p-4 border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl mb-2 text-sm text-center font-medium shadow-sm">
                        {status.error}
                    </div>
                )}
                
                <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-5 @2xl:gap-7">
                    <div>
                        <label className={labelClasses}>Ваше ім'я *</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                name="name" 
                                value={formData.name} 
                                onChange={handleChange}
                                required 
                                placeholder="Іван Іванов"
                                className={inputClasses} 
                            />
                            <User size={18} strokeWidth={2.5} className={iconClasses} />
                        </div>
                    </div>
                    <div>
                        <label className={labelClasses}>Email *</label>
                        <div className="relative">
                            <input 
                                type="email" 
                                name="email" 
                                value={formData.email} 
                                onChange={handleChange} 
                                placeholder="email@example.com" 
                                required 
                                className={inputClasses} 
                            />
                            <AtSign size={18} strokeWidth={2.5} className={iconClasses} />
                        </div>
                    </div>
                </div>
                <div>
                    <label className={labelClasses}>Тема</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            name="subject" 
                            value={formData.subject} 
                            onChange={handleChange}
                            placeholder="Наприклад: Питання щодо співпраці"
                            className={inputClasses} 
                        />
                        <Type size={18} strokeWidth={2.5} className={iconClasses} />
                    </div>
                </div>
                <div>
                    <label className={labelClasses}>Повідомлення *</label>
                    <div className="relative">
                        <textarea 
                            name="message" 
                            value={formData.message} 
                            onChange={handleChange} 
                            placeholder="Напишіть ваше повідомлення тут..." 
                            required 
                            className={`custom-scrollbar min-h-30 @2xl:min-h-40 resize-y ${inputClasses}`}
                        />
                        <MessageSquare size={18} strokeWidth={2.5} className={textareaIconClasses} />
                    </div>
                </div>
                <div 
                    className={`
                        flex w-full mt-2 @2xl:mt-4
                        ${buttonConfig.width === 'full' ? 'text-center justify-stretch' : (alignMap[buttonConfig.alignment] || 'justify-center')}
                    `}
                    style={{ textAlign: buttonConfig.width === 'full' ? 'center' : (buttonConfig.alignment || 'center') }}
                > 
                    <button 
                        type="submit" 
                        className={`
                            ${btnClass}
                            inline-flex items-center justify-center gap-2 @2xl:gap-2.5 font-semibold transition-all duration-300 appearance-none shadow-sm
                            ${(isEditorPreview || status.loading) ? 'cursor-default' : 'cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-(--site-accent)/20'}
                            ${sizeClasses[buttonConfig.size || 'medium']}
                        `}
                        disabled={status.loading} 
                        style={{
                            width: buttonConfig.width === 'full' ? '100%' : 'auto',
                            fontFamily: fontStyles.button,
                            borderRadius: `${safeRadius}px`,
                            ...dynamicBtnStyle
                        }}
                        onClick={(e) => {
                            if (isEditorPreview) {
                                e.preventDefault();
                            }
                        }}
                    >
                        {buttonConfig.iconPosition === 'left' && <ButtonIcon name={buttonConfig.icon} size={buttonConfig.size} flip={buttonConfig.iconFlip} />}
                        <span>{status.loading ? 'Відправка...' : (buttonConfig.text || 'Надіслати')}</span>
                        {buttonConfig.iconPosition === 'right' && <ButtonIcon name={buttonConfig.icon} size={buttonConfig.size} flip={buttonConfig.iconFlip} />}
                    </button>
                </div>
            </form>
        </div>
    );
};

const ButtonIcon = ({ name, size, flip }) => {
    if (!name || name === 'none') return null;
    const s = size === 'large' ? 20 : 18; 
    const style = { transform: flip ? 'scaleX(-1)' : 'none', flexShrink: 0 };
    const icons = {
        arrowRight: <ArrowRight size={s} strokeWidth={2.5} style={style} />,
        cart: <ShoppingCart size={s} strokeWidth={2.5} style={style} />,
        mail: <Mail size={s} strokeWidth={2.5} style={style} />,
        phone: <Phone size={s} strokeWidth={2.5} style={style} />,
        check: <Check size={s} strokeWidth={3} style={style} />,
        star: <Star size={s} fill="currentColor" style={style} />,
        pointer: <MousePointer2 size={s} strokeWidth={2.5} style={style} />
    };
    return icons[name] || null;
};

export default React.memo(FormBlock, areBlockPropsEqual);