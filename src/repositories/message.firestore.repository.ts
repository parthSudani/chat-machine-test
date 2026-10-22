import {
  firestore,
  FieldValue,
  Timestamp,
  DocumentReference,
  Transaction,
} from '../config/firebase';
import { AppError } from '../utils/appError';

export interface FirestoreMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
}

export interface ReadReceiptDocument {
  userId: string;
  messageId: string;
  readAt: Timestamp;
}

export interface MemberLastSeenDocument {
  userId: string;
  lastSeenMessageId: string;
  lastSeenAt: Timestamp;
  lastSeenMessageCreatedAt: Timestamp;
}

export class MessageFirestoreRepository {
  /**
   * Reference to chats collection
   */
  private chatsCol = firestore.collection('chats');

  /**
   * Helper to get chat document reference
   */
  getChatRef(chatId: string): DocumentReference {
    return this.chatsCol.doc(chatId);
  }

  /**
   * Helper to get message document reference
   */
  getMessageRef(chatId: string, messageId: string): DocumentReference {
    return this.getChatRef(chatId).collection('messages').doc(messageId);
  }

  /**
   * Helper to get receipt document reference (receipts)
   */
  getReceiptRef(
    chatId: string,
    messageId: string,
    userId: string
  ): DocumentReference {
    return this.getMessageRef(chatId, messageId).collection('receipts').doc(userId);
  }

  /**
   * Helper to get read document reference (reads alias)
   */
  getReadRef(
    chatId: string,
    messageId: string,
    userId: string
  ): DocumentReference {
    return this.getMessageRef(chatId, messageId).collection('reads').doc(userId);
  }

  /**
   * Helper to get member last-seen document reference (members)
   */
  getMemberRef(chatId: string, userId: string): DocumentReference {
    return this.getChatRef(chatId).collection('members').doc(userId);
  }

  /**
   * Helper to get lastSeen document reference (lastSeen alias)
   */
  getLastSeenRef(chatId: string, userId: string): DocumentReference {
    return this.getChatRef(chatId).collection('lastSeen').doc(userId);
  }

  /**
   * Helper to create a message in Firestore (useful for seeding, messaging, and tests)
   */
  async createMessage(
    chatId: string,
    senderId: string,
    text: string,
    customId?: string,
    customTimestamp?: Timestamp
  ): Promise<FirestoreMessage> {
    const msgRef = customId
      ? this.getMessageRef(chatId, customId)
      : this.getChatRef(chatId).collection('messages').doc();

    const createdAt = customTimestamp || (FieldValue.serverTimestamp() as unknown as Timestamp);

    const messageData = {
      id: msgRef.id,
      chatId,
      senderId,
      text,
      createdAt,
    };

    await msgRef.set(messageData);

    const snapshot = await msgRef.get();
    const data = snapshot.data();

    return {
      id: msgRef.id,
      chatId,
      senderId,
      text,
      createdAt: data?.createdAt as Timestamp,
    };
  }

  /**
   * Fetches a message by chatId and messageId
   */
  async getMessage(chatId: string, messageId: string): Promise<FirestoreMessage | null> {
    const doc = await this.getMessageRef(chatId, messageId).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data()!;
    if (data.chatId !== chatId) {
      return null;
    }
    return {
      id: doc.id,
      chatId: data.chatId as string,
      senderId: data.senderId as string,
      text: data.text as string,
      createdAt: data.createdAt as Timestamp,
    };
  }

  /**
   * Chronologically retrieves messages with deterministic ordering and cursor pagination
   */
  async getChatMessages(
    chatId: string,
    limit: number,
    cursor?: string
  ): Promise<{ messages: FirestoreMessage[]; nextCursor: string | null }> {
    let query = this.getChatRef(chatId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .orderBy('__name__', 'asc')
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await this.getMessageRef(chatId, cursor).get();
      if (!cursorDoc.exists) {
        throw AppError.badRequest(
          `Invalid pagination cursor: message '${cursor}' does not exist in chat '${chatId}'`,
          'INVALID_CURSOR'
        );
      }
      const cursorData = cursorDoc.data();
      if (cursorData?.chatId !== chatId) {
        throw AppError.badRequest(
          `Invalid pagination cursor: message '${cursor}' does not belong to chat '${chatId}'`,
          'INVALID_CURSOR'
        );
      }
      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.get();
    let hasMore = false;
    let docs = snapshot.docs;

    if (docs.length > limit) {
      hasMore = true;
      docs = docs.slice(0, limit);
    }

    const messages = docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        chatId: data.chatId as string,
        senderId: data.senderId as string,
        text: data.text as string,
        createdAt: data.createdAt as Timestamp,
      };
    });

    const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1]!.id : null;

    return { messages, nextCursor };
  }

  /**
   * Idempotently saves a read receipt preserving the original read timestamp
   */
  async recordReadReceiptIdempotent(
    chatId: string,
    messageId: string,
    userId: string
  ): Promise<{ receipt: ReadReceiptDocument; isNew: boolean }> {
    const receiptRef = this.getReceiptRef(chatId, messageId, userId);
    const readRef = this.getReadRef(chatId, messageId, userId);

    return firestore.runTransaction(async (tx: Transaction) => {
      let receiptDoc = await tx.get(receiptRef);
      if (!receiptDoc.exists) {
        receiptDoc = await tx.get(readRef);
      }

      if (receiptDoc.exists) {
        const data = receiptDoc.data()!;
        return {
          receipt: {
            userId: data.userId as string,
            messageId,
            readAt: data.readAt as Timestamp,
          },
          isNew: false,
        };
      }

      // First time reading: record server timestamp
      const newReadAt = Timestamp.now();
      const receiptData = {
        userId,
        messageId,
        readAt: FieldValue.serverTimestamp(),
      };
      tx.set(receiptRef, receiptData);
      tx.set(readRef, receiptData);

      return {
        receipt: {
          userId,
          messageId,
          readAt: newReadAt,
        },
        isNew: true,
      };
    });
  }

  /**
   * Updates last-seen message pointer transactionally with strict monotonicity check
   */
  async updateLastSeenMonotonic(
    chatId: string,
    userId: string,
    targetMessage: FirestoreMessage
  ): Promise<{
    status: 'updated' | 'already_current' | 'ignored_older_than_current';
    lastSeenMessageId: string;
    lastSeenAt: Timestamp;
  }> {
    const memberRef = this.getMemberRef(chatId, userId);
    const lastSeenRef = this.getLastSeenRef(chatId, userId);

    return firestore.runTransaction(async (tx: Transaction) => {
      let memberDoc = await tx.get(memberRef);
      if (!memberDoc.exists) {
        memberDoc = await tx.get(lastSeenRef);
      }
      const now = Timestamp.now();

      if (memberDoc.exists) {
        const currentData = memberDoc.data()!;
        const currentMessageId = currentData.lastSeenMessageId as string | undefined;
        const currentCreatedAt = currentData.lastSeenMessageCreatedAt as Timestamp | undefined;

        if (currentMessageId === targetMessage.id) {
          return {
            status: 'already_current',
            lastSeenMessageId: currentMessageId,
            lastSeenAt: (currentData.lastSeenAt as Timestamp) || now,
          };
        }

        if (currentCreatedAt) {
          const targetMillis = targetMessage.createdAt.toMillis();
          const currentMillis = currentCreatedAt.toMillis();

          // 1. If target message timestamp is older than current last-seen, ignore update
          if (targetMillis < currentMillis) {
            return {
              status: 'ignored_older_than_current',
              lastSeenMessageId: currentMessageId!,
              lastSeenAt: (currentData.lastSeenAt as Timestamp) || now,
            };
          }

          // 2. If timestamps are identical, break tie with deterministic document ID comparison
          if (targetMillis === currentMillis) {
            if (targetMessage.id <= currentMessageId!) {
              return {
                status: 'ignored_older_than_current',
                lastSeenMessageId: currentMessageId!,
                lastSeenAt: (currentData.lastSeenAt as Timestamp) || now,
              };
            }
          }
        }
      }

      // Advance last-seen pointer across both canonical member ref and lastSeen alias
      const payload = {
        userId,
        lastSeenMessageId: targetMessage.id,
        lastSeenAt: FieldValue.serverTimestamp(),
        lastSeenMessageCreatedAt: targetMessage.createdAt,
      };
      tx.set(memberRef, payload, { merge: true });
      tx.set(lastSeenRef, payload, { merge: true });

      return {
        status: 'updated',
        lastSeenMessageId: targetMessage.id,
        lastSeenAt: now,
      };
    });
  }

  /**
   * Fetches member last-seen document
   */
  async getMemberLastSeen(
    chatId: string,
    userId: string
  ): Promise<MemberLastSeenDocument | null> {
    let doc = await this.getMemberRef(chatId, userId).get();
    if (!doc.exists) {
      doc = await this.getLastSeenRef(chatId, userId).get();
    }
    if (!doc.exists) {
      return null;
    }
    const data = doc.data()!;
    return {
      userId: data.userId as string,
      lastSeenMessageId: data.lastSeenMessageId as string,
      lastSeenAt: data.lastSeenAt as Timestamp,
      lastSeenMessageCreatedAt: data.lastSeenMessageCreatedAt as Timestamp,
    };
  }
}

export const messageFirestoreRepository = new MessageFirestoreRepository();
