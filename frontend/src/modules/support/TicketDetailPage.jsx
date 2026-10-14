// frontend/src/modules/support/TicketDetailPage.jsx
import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../../shared/api/api';
import { AuthContext } from '../../app/providers/AuthContext';
import { Button } from '../../shared/ui/elements/Button';
import LoadingState from '../../shared/ui/complex/LoadingState';
import ConfirmModal from '../../shared/ui/complex/ConfirmModal';
import { useConfirmDialog } from '../../shared/hooks/useConfirmDialog';
import DragDropWrapper from '../../shared/ui/complex/DragDropWrapper';
import { FILE_LIMITS } from '../../shared/config/limits';
import { getAttachmentUrl } from '../../shared/utils/mediaUtils';
import NotFoundPage from '../../pages/NotFoundPage';
import { toast } from 'react-toastify';
import { Helmet } from 'react-helmet-async';
import { Send, Loader, User, Shield, Lock, ArrowLeft, CheckCircle, Clock, XCircle, Paperclip, X, RotateCcw, ArrowDown } from 'lucide-react';

const STAFF_ROLES = ['admin', 'moderator'];

const TicketDetailPage = () => {
    const { ticketId } = useParams();
    const navigate = useNavigate();
    const [ticket, setTicket] = useState(null);
    const [replyBody, setReplyBody] = useState('');
    const [attachments, setAttachments] = useState([]); 
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [isNotFound, setIsNotFound] = useState(false);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const { user } = useContext(AuthContext);
    const { isOpen, config, requestConfirm, close } = useConfirmDialog();
    const messagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);
    const fileInputRef = useRef(null);
    const textareaRef = useRef(null); 
    const ticketRef = useRef(null); 
    const isAtBottomRef = useRef(true);
    useEffect(() => {
        ticketRef.current = ticket;
    }, [ticket]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        setUnreadCount(0); 
    };

    const handleScroll = () => {
        if (!chatContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        const distanceToBottom = scrollHeight - scrollTop - clientHeight;
        const isBottom = distanceToBottom < 80;
        isAtBottomRef.current = isBottom;
        setShowScrollButton(!isBottom);
        if (isBottom && unreadCount > 0) {
            setUnreadCount(0);
        }
    };

    const fetchTicket = async (isBackground = false) => {
        try {
            const response = await apiClient.get(`/support/${ticketId}`);
            const newData = response.data;
            if (isBackground && ticketRef.current) {
                const prevCount = ticketRef.current.replies?.length || 0;
                const newCount = newData.replies?.length || 0;
                if (newCount > prevCount) {
                    const newMsgs = newCount - prevCount;
                    if (isAtBottomRef.current) {
                        setTimeout(scrollToBottom, 100);
                    } else {
                        setUnreadCount(prev => prev + newMsgs);
                    }
                }
            }
            setTicket(newData);
            if (!isBackground) {
                setTimeout(scrollToBottom, 100);
            }
        } catch (err) {
            if (err.response && err.response.status === 404) {
                setIsNotFound(true);
            } else if (!isBackground) {
                setError(err.response?.data?.message || 'Сталася помилка при завантаженні звернення.');
            }
        } finally {
            if (!isBackground) setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchTicket();
        const intervalId = setInterval(() => {
            fetchTicket(true);
        }, 30000);
        return () => clearInterval(intervalId);
    }, [ticketId]);

    const isSpamBlocked = useMemo(() => {
        if (!ticket || !user) return false;
        if (STAFF_ROLES.includes(user.role)) return false;
        const replies = ticket.replies || [];
        if (replies.length < 2) return false;
        const lastTwo = replies.slice(-2);
        return lastTwo.every(r => r.user_id === user.id);
    }, [ticket, user]);

    const isInputDisabled = useMemo(() => {
        if (!ticket) return true;
        return ticket.status === 'closed' || isSpamBlocked;
    }, [ticket, isSpamBlocked]);
    const isCurrentUserAdmin = STAFF_ROLES.includes(user?.role);
    const closedByText = ticket?.closed_by === 'admin'
        ? (isCurrentUserAdmin ? 'Ви (Адміністратор) закрили це звернення.' : 'Це звернення було закрите адміністратором.')
        : (isCurrentUserAdmin ? 'Користувач закрив це звернення.' : 'Ви закрили це звернення.');
    const handleStatusChange = (newStatus) => {
        const isClosing = newStatus === 'closed';
        requestConfirm({
            title: isClosing ? 'Закрити звернення?' : 'Відновити звернення?',
            message: isClosing 
                ? 'Ви впевнені, що хочете закрити це звернення? Ви більше не зможете писати в нього.' 
                : 'Ви впевнені, що хочете відновити це звернення та відкрити чат?',
            type: isClosing ? 'warning' : 'info',
            confirmLabel: isClosing ? 'Закрити' : 'Відновити',
            onConfirm: async () => {
                try {
                    await apiClient.put(`/support/${ticketId}/status`, { status: newStatus });
                    toast.success(isClosing ? 'Звернення успішно закрито' : 'Звернення відновлено');
                    close();
                    await fetchTicket();
                } catch (err) {
                    toast.error(err.response?.data?.message || 'Помилка при зміні статусу');
                    close();
                }
            }
        });
    };

    const handleFileSelect = (files) => {
        if (attachments.length + files.length > FILE_LIMITS.TICKET_ATTACHMENT.MAX_FILES) {
            toast.error(`Максимальна кількість файлів: ${FILE_LIMITS.TICKET_ATTACHMENT.MAX_FILES}`);
            return;
        }
        const validFiles = Array.from(files).filter(file => {
            if (!file.type.startsWith('image/')) {
                toast.error(`Файл ${file.name} не є зображенням.`);
                return false;
            }
            if (file.size > FILE_LIMITS.TICKET_ATTACHMENT.MAX_SIZE) {
                const maxSizeMB = FILE_LIMITS.TICKET_ATTACHMENT.MAX_SIZE / (1024 * 1024);
                toast.error(`Файл ${file.name} перевищує ліміт у ${maxSizeMB} МБ.`);
                return false;
            }
            return true;
        });
        const newAttachments = validFiles.map(file => Object.assign(file, {
            preview: URL.createObjectURL(file)
        }));
        setAttachments(prev => [...prev, ...newAttachments].slice(0, FILE_LIMITS.TICKET_ATTACHMENT.MAX_FILES));
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeAttachment = (indexToRemove) => {
        setAttachments(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    useEffect(() => {
        return () => attachments.forEach(file => URL.revokeObjectURL(file.preview));
    }, [attachments]);

    const handleReplySubmit = async (e) => {
        e.preventDefault();
        if ((!replyBody.trim() && attachments.length === 0) || isInputDisabled) return;
        setSending(true);
        try {
            const formData = new FormData();
            if (replyBody.trim()) formData.append('body', replyBody);
            attachments.forEach(file => {
                formData.append('attachments', file);
            });
            await apiClient.post(`/support/${ticketId}/reply`, formData);
            setReplyBody('');
            setAttachments([]);
            if (textareaRef.current) {
                textareaRef.current.style.height = '40px';
                textareaRef.current.style.overflowY = 'hidden';
            }
            await fetchTicket(false); 
        } catch (err) {
            if (err.response && err.response.status === 429) {
                fetchTicket(false);
            } else {
                toast.error(err.response?.data?.message || 'Не вдалося надіслати відповідь.');
            }
        } finally {
            setSending(false);
        }
    };

    const StatusBadge = ({ status }) => {
        let color = 'text-(--platform-text-secondary)';
        let bg = 'bg-black/5';
        let icon = <Clock size={14} />;
        let text = 'Закрито';
        if (status === 'open') {
            color = 'text-(--platform-warning)';
            bg = 'bg-[rgba(245,158,11,0.1)]';
            text = 'Очікує відповіді';
        } else if (status === 'answered') {
            color = 'text-(--platform-success)';
            bg = 'bg-[rgba(16,185,129,0.1)]';
            icon = <CheckCircle size={14} />;
            text = 'Є відповідь';
        } else {
            icon = <XCircle size={14} />;
        }
        return (
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium ${color} ${bg}`}>
                {icon}
                {text}
            </div>
        );
    };

    if (isNotFound) return <NotFoundPage />;
    if (loading) return <LoadingState />;
    if (error) return <div className="text-center p-8 text-(--platform-danger)">{error}</div>;
    if (!ticket) return null;
    const allMessages = [
        {
            id: 'original', 
            user_id: ticket.user_id, 
            body: ticket.body,
            attachments: ticket.attachments, 
            created_at: ticket.created_at,
            role: 'user', 
            username: ticket.username, 
            avatar_url: ticket.avatar_url 
        },
        ...ticket.replies
    ];

    return (
        <DragDropWrapper 
            onDropFiles={handleFileSelect}
            disabled={isInputDisabled}
            className="absolute inset-0 w-full h-full flex flex-col bg-(--platform-bg) z-50 overflow-hidden"
        >
            <Helmet>
                <title>{`#${ticket.id} - Підтримка | Kendr`}</title>
            </Helmet>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <div className="px-4 sm:px-6 h-15 sm:h-16 bg-(--platform-card-bg) border-b border-(--platform-border-color) flex items-center justify-between shrink-0 z-10 shadow-sm relative">
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 pr-4">
                    <Button 
                        variant="ghost" 
                        icon={<ArrowLeft size={20}/>} 
                        onClick={() => navigate(isCurrentUserAdmin ? '/admin/tickets' : '/support/my-tickets')} 
                        className="shrink-0 p-2 sm:px-4"
                    />
                    <div className="flex flex-col truncate min-w-0">
                        <h1 className="text-base sm:text-lg font-bold m-0 text-(--platform-text-primary) truncate">
                            {ticket.subject}
                        </h1>
                        <div className="text-xs sm:text-[13px] text-(--platform-text-secondary) truncate mt-0.5">
                            #{ticket.id} <span className="hidden sm:inline">•</span> {new Date(ticket.created_at).toLocaleDateString()}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <StatusBadge status={ticket.status} />
                    {ticket.status !== 'closed' && (
                        <Button 
                            variant="ghost" 
                            onClick={() => handleStatusChange('closed')}
                            className="text-(--platform-danger) hover:bg-red-50 p-2 sm:px-3 sm:py-1.5 text-xs sm:text-[13px]"
                        >
                            <XCircle size={16} className="sm:mr-1.5 shrink-0" />
                            <span className="hidden sm:inline">Закрити</span>
                        </Button>
                    )}
                    {ticket.status === 'closed' && isCurrentUserAdmin && (
                        <Button 
                            variant="ghost" 
                            onClick={() => handleStatusChange('open')}
                            className="text-(--platform-success) hover:bg-green-50 p-2 sm:px-3 sm:py-1.5 text-xs sm:text-[13px]"
                        >
                            <RotateCcw size={16} className="sm:mr-1.5 shrink-0" />
                            <span className="hidden sm:inline">Відновити</span>
                        </Button>
                    )}
                </div>
            </div>
            <div className="flex-1 relative flex flex-col min-h-0">
                {(ticket.status === 'closed' || isSpamBlocked) && (
                    <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center p-4">
                        <div className="pointer-events-auto bg-(--platform-card-bg)/95 backdrop-blur-sm p-6 sm:p-8 rounded-2xl border border-(--platform-border-color) shadow-xl flex flex-col items-center text-center gap-4 w-[90%] max-w-md animate-[fadeIn_0.3s_ease]">
                            
                            {ticket.status === 'closed' ? (
                                <>
                                    <div className="w-14 h-14 rounded-full bg-black/5 text-(--platform-text-secondary) flex items-center justify-center mb-1">
                                        <Lock size={28} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-lg sm:text-xl text-(--platform-text-primary) mb-2">
                                            Звернення закрито
                                        </div>
                                        <div className="text-(--platform-text-secondary) text-sm sm:text-base leading-relaxed">
                                            {closedByText}<br/>
                                            Можливість писати вимкнена.
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="w-14 h-14 rounded-full bg-[rgba(245,158,11,0.1)] text-(--platform-accent) flex items-center justify-center mb-1">
                                        <Clock size={28} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-lg sm:text-xl text-(--platform-text-primary) mb-2">
                                            Очікуйте на відповідь
                                        </div>
                                        <div className="text-(--platform-text-secondary) text-sm sm:text-base leading-relaxed">
                                            Ви надіслали декілька повідомлень поспіль.<br/>
                                            Можливість писати тимчасово обмежена.
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
                <div 
                    className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 bg-(--platform-bg) custom-scrollbar"
                    ref={chatContainerRef}
                    onScroll={handleScroll}
                >
                    <div className="text-center my-4 opacity-50 text-xs sm:text-[13px]">
                        Початок діалогу
                    </div>
                    {allMessages.map((msg, index) => {
                        const isMe = msg.user_id === user?.id; 
                        const isAdmin = STAFF_ROLES.includes(msg.role);
                        const avatarSrc = getAttachmentUrl(msg.avatar_url);
                        let msgAttachments = [];
                        try {
                            if (msg.attachments) {
                                let parsed = msg.attachments;
                                if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                                if (typeof parsed === 'string') parsed = JSON.parse(parsed); 
                                
                                if (Array.isArray(parsed)) {
                                    msgAttachments = parsed;
                                }
                            }
                        } catch (e) {
                            console.error('Помилка парсингу картинок:', e);
                        }
                        return (
                            <div key={msg.id || index} className={`flex gap-2 sm:gap-3 mb-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                {!isMe && (
                                    <div 
                                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white shrink-0 overflow-hidden mt-5 sm:mt-5.5 ${isAdmin ? 'bg-(--platform-accent)' : 'bg-(--platform-border-color)'}`}
                                        title={msg.username}
                                    >
                                        {avatarSrc ? <img src={avatarSrc} alt="" className="w-full h-full object-cover" /> : (isAdmin ? <Shield size={16}/> : <User size={16}/>)}
                                    </div>
                                )}
                                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-150`}>
                                    <span className={`text-[11px] sm:text-xs font-semibold mb-1 ${isAdmin ? 'text-(--platform-accent)' : 'text-(--platform-text-secondary)'} ${isMe ? 'mr-1' : 'ml-1'}`}>
                                        {isMe ? 'Ви' : (isAdmin ? 'Підтримка' : (msg.username || 'Користувач'))}
                                    </span>
                                    <div 
                                        className={`
                                            p-3 sm:px-4 sm:py-3 rounded-2xl relative shadow-[0_1px_2px_rgba(0,0,0,0.05)]
                                            ${isMe ? 'bg-(--platform-accent) text-white rounded-tr-sm' : (isAdmin ? 'bg-blue-500/10 text-(--platform-text-primary) rounded-tl-sm' : 'bg-(--platform-card-bg) text-(--platform-text-primary) rounded-tl-sm')}
                                        `}
                                    >
                                        {msg.body && (
                                            <div className="whitespace-pre-wrap leading-relaxed text-[13px] sm:text-sm wrap-break-word">
                                                {msg.body}
                                            </div>
                                        )}
                                        {msgAttachments.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {msgAttachments.map((url, i) => (
                                                    <img 
                                                        key={i} 
                                                        src={getAttachmentUrl(url)} 
                                                        alt="attachment" 
                                                        className="max-w-37.5 sm:max-w-50 max-h-37.5 sm:max-h-50 rounded-lg object-cover cursor-pointer border border-black/10" 
                                                        onClick={() => window.open(getAttachmentUrl(url), '_blank')} 
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        <div className={`text-[10px] sm:text-[11px] mt-1.5 opacity-70 text-right whitespace-nowrap ${isMe ? 'text-white/90' : 'text-(--platform-text-secondary)'}`}>
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} className="h-4" />
                </div>
            </div>
            <div className="px-3 sm:px-6 py-3 sm:py-4 bg-(--platform-bg) shrink-0 z-20 relative border-t border-(--platform-border-color) sm:border-none">
                {showScrollButton && (
                    <div className="absolute -top-12 right-4 sm:-top-16 sm:right-8 z-50">
                        <Button
                            variant="primary"
                            onClick={scrollToBottom}
                            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full p-0 flex items-center justify-center shadow-lg relative bg-(--platform-accent) hover:bg-(--platform-accent)/90 transition-transform hover:scale-105"
                        >
                            <ArrowDown size={18} className="text-white" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-(--platform-danger) text-white text-[10px] sm:text-[11px] font-bold w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full flex items-center justify-center border-2 border-(--platform-bg) leading-none shadow-sm">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </Button>
                    </div>
                )}
                {attachments.length > 0 && (
                    <div className="flex gap-2 pb-3 overflow-x-auto custom-scrollbar">
                        {attachments.map((file, index) => (
                            <div key={index} className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg border border-(--platform-border-color) overflow-hidden shrink-0">
                                <img src={file.preview} alt="preview" className="w-full h-full object-cover" />
                                <div 
                                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 cursor-pointer z-10 hover:bg-black transition-colors" 
                                    onClick={() => removeAttachment(index)}
                                >
                                    <X size={12} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <form 
                    onSubmit={handleReplySubmit} 
                    className="relative flex items-end gap-2 sm:gap-3 bg-(--platform-card-bg) rounded-2xl sm:rounded-3xl p-1.5 sm:p-2 sm:px-3 border border-(--platform-border-color) shadow-sm"
                >
                    <input 
                        type="file" 
                        multiple 
                        accept="image/jpeg, image/png, image/webp"
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={(e) => handleFileSelect(e.target.files)}
                        disabled={isInputDisabled}
                    />
                    <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isInputDisabled}
                        className="w-10 h-10 sm:w-11 sm:h-11 rounded-full p-0 flex items-center justify-center text-(--platform-text-secondary) hover:text-(--platform-text-primary) hover:bg-black/5 shrink-0"
                    >
                        <Paperclip size={20} className="shrink-0" />
                    </Button>
                    <textarea 
                        ref={textareaRef}
                        value={replyBody} 
                        onChange={e => setReplyBody(e.target.value)} 
                        readOnly={sending || isInputDisabled} 
                        placeholder={isInputDisabled ? "Чат закрито" : "Ваше повідомлення ..."}
                        rows={1}
                        className={`
                            flex-1 bg-transparent border-none outline-none text-(--platform-text-primary) text-[13px] sm:text-sm resize-none py-2.5 sm:py-3 custom-scrollbar
                            h-10 sm:h-11 min-h-10 sm:min-h-11 max-h-25 sm:max-h-30
                            ${isInputDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-text'}
                        `}
                        onInput={(e) => {
                            e.target.style.height = '40px'; 
                            e.target.style.height = e.target.scrollHeight + 'px';
                            e.target.style.overflowY = e.target.scrollHeight >= 120 ? 'auto' : 'hidden';
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleReplySubmit(e);
                            }
                        }}
                    />
                    <Button 
                        type="submit" 
                        variant="primary"
                        disabled={sending || (!replyBody.trim() && attachments.length === 0) || isInputDisabled}
                        className="w-10 h-10 sm:w-11 sm:h-11 rounded-full p-0 flex items-center justify-center shrink-0 shadow-md transition-transform hover:scale-105 active:scale-95 disabled:hover:scale-100"
                    >
                        {sending ? (
                            <Loader className="animate-spin shrink-0" size={20} />
                        ) : isInputDisabled ? (
                            <Lock size={20} className="shrink-0" />
                        ) : (
                            <Send size={18} className="shrink-0" style={{ transform: 'translate(-1px, 1px)' }} />
                        )}
                    </Button>
                </form>
            </div>
            <ConfirmModal isOpen={isOpen} {...config} onCancel={close} />
        </DragDropWrapper>
    );
};

export default TicketDetailPage;